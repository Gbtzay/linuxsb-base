// ==UserScript==
// @name         LINUX.SB（LTS）
// @name:en      LINUX.SB (LTS)
// @namespace    https://linux.sb/
// @version      2.0.36
// @description  【LTS】一份脚本含基座与精简功能包。请先卸掉「LINUX.SB 氢」和「LINUX.SB 氧」。冻新功能，只修阻断。
// @description:en  [LTS] Base + feature pack in one script. Uninstall Hydrogen and Oxygen first. Feature-frozen.
// @author       xB70sR71
// @license      MIT
// @run-at       document-start
// @match        https://linux.sb/*
// @match        https://www.linux.sb/*
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
  W.__LSB_LTS_VERSION__ = "2.0.36";
(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: !0 });
  };

  // src/util.js
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function clone(v) {
    if (v === null || typeof v != "object") return v;
    if (typeof structuredClone == "function")
      try {
        return structuredClone(v);
      } catch {
        return v;
      }
    try {
      return JSON.parse(JSON.stringify(v));
    } catch {
      return v;
    }
  }
  function deepFreeze(v) {
    if (v && typeof v == "object" && !Object.isFrozen(v)) {
      Object.freeze(v);
      for (let k of Object.getOwnPropertyNames(v)) deepFreeze(v[k]);
    }
    return v;
  }
  function parseVersion(v) {
    let m = String(v || "").trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  }
  function compareVersion(a, b) {
    let pa = parseVersion(a) || [0, 0, 0], pb = parseVersion(b) || [0, 0, 0];
    for (let i = 0; i < 3; i++)
      if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
    return 0;
  }
  function satisfies(version, range) {
    let r = String(range || "*").trim();
    if (!r || r === "*" || r === "latest") return !0;
    let v = parseVersion(version);
    if (!v) return !1;
    for (let part of r.split("||"))
      if (part.split(/\s+/).filter(Boolean).every((c) => satisfiesOne(v, c))) return !0;
    return !1;
  }
  function satisfiesOne(v, comparator) {
    let m = comparator.match(/^(\^|~|>=|<=|>|<|=)?\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    if (!m) return !1;
    let op = m[1] || "=", t = [Number(m[2]), m[3] === void 0 ? 0 : Number(m[3]), m[4] === void 0 ? 0 : Number(m[4])], cmp = cmpArr(v, t);
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
        return cmp < 0 ? !1 : t[0] === 0 ? v[0] === 0 && v[1] === t[1] : v[0] === t[0];
      case "~":
        return cmp < 0 ? !1 : v[0] === t[0] && v[1] === t[1];
      default:
        return !1;
    }
  }
  function cmpArr(a, b) {
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    return 0;
  }
  function num(s) {
    let m = String(s ?? "").replace(/[,\s]/g, "").match(/-?\d+/);
    return m ? Number(m[0]) : 0;
  }
  function text(el) {
    return el ? String(el.textContent || "").replace(/\s+/g, " ").trim() : "";
  }
  function idFrom(href, prefix) {
    let m = String(href || "").match(new RegExp(`/${prefix}/(\\d+)`));
    return m ? Number(m[1]) : null;
  }
  function uid(prefix = "lsb") {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
  }
  function throttle(fn, wait) {
    let last = 0, timer = null, pending = null;
    return function(...args) {
      pending = args;
      let now = Date.now(), rest = wait - (now - last);
      rest <= 0 ? (last = now, fn.apply(this, pending)) : timer || (timer = setTimeout(() => {
        timer = null, last = Date.now(), fn.apply(this, pending);
      }, rest));
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
      this._map = /* @__PURE__ */ new Map(), this._handlers = /* @__PURE__ */ new Map(), this._onError = onError || ((e, info) => console.error("[LSB bus]", info, e)), this._replay = /* @__PURE__ */ new Map();
    }
    on(event, fn, { owner = "anonymous", once = !1 } = {}) {
      if (typeof fn != "function") throw new TypeError("on(event, fn): fn 必须是函数");
      let rec = { fn, owner, once, event };
      if (this._map.has(event) || this._map.set(event, /* @__PURE__ */ new Set()), this._map.get(event).add(rec), this._replay.has(event)) {
        let { payload, meta } = this._replay.get(event);
        this._invoke(rec, clone(payload), meta);
      }
      return () => this.off(event, fn);
    }
    once(event, fn, opts = {}) {
      return this.on(event, fn, { ...opts, once: !0 });
    }
    off(event, fn) {
      let set = this._map.get(event);
      if (!set) return !1;
      for (let rec of set)
        if (rec.fn === fn)
          return set.delete(rec), set.size || this._map.delete(event), !0;
      return !1;
    }
    /** 卸载某个插件的所有监听与 handler */
    offOwner(owner) {
      for (let [event, set] of [...this._map]) {
        for (let rec of [...set]) rec.owner === owner && set.delete(rec);
        set.size || this._map.delete(event);
      }
      for (let [name, rec] of [...this._handlers])
        rec.owner === owner && this._handlers.delete(name);
    }
    /**
     * @param {string} event
     * @param {any} payload
     * @param {{ sticky?: boolean, source?: string, raw?: boolean }} opts
     *   sticky: 记住最后一次，后注册的监听者立即收到（如 site:ready）
     *   raw:    不深拷贝（传 DOM 节点时用）
     */
    emit(event, payload, opts = {}) {
      let meta = { event, source: opts.source || "core", ts: Date.now(), id: uid("ev") }, data = opts.raw ? payload : clone(payload);
      opts.sticky && this._replay.set(event, { payload: data, meta });
      let n = 0;
      for (let key of this._matching(event))
        for (let rec of [...this._map.get(key) || []])
          n++, this._invoke(rec, data, meta);
      return n;
    }
    _invoke(rec, payload, meta) {
      rec.once && this._map.get(rec.event)?.delete(rec);
      try {
        let r = rec.fn(payload, meta);
        r && typeof r.catch == "function" && r.catch((e) => this._onError(e, { event: meta.event, owner: rec.owner, async: !0 }));
      } catch (e) {
        this._onError(e, { event: meta.event, owner: rec.owner });
      }
    }
    /** 事件名 a:b:c 会命中 a:b:c、a:b:*、a:*、* */
    _matching(event) {
      let keys = ["*"], parts = String(event).split(":");
      for (let i = 1; i < parts.length; i++) keys.push(parts.slice(0, i).join(":") + ":*");
      return keys.push(event), keys.filter((k) => this._map.has(k));
    }
    /* ─────────── 一对一 RPC ─────────── */
    /** 注册可被调用的能力，同名后注册者报错（先到先得，避免插件互相覆盖） */
    handle(name, fn, { owner = "anonymous" } = {}) {
      if (this._handlers.has(name))
        throw new Error(`handle('${name}') 已被 ${this._handlers.get(name).owner} 占用`);
      return this._handlers.set(name, { owner, fn }), () => {
        this._handlers.get(name)?.fn === fn && this._handlers.delete(name);
      };
    }
    hasHandler(name) {
      return this._handlers.has(name);
    }
    /** await bus.request('mod:stats', { uid: 1 }) */
    async request(name, payload, { timeout = 15e3 } = {}) {
      let rec = this._handlers.get(name);
      if (!rec) throw new Error(`no handler for '${name}'`);
      let call = Promise.resolve().then(() => rec.fn(clone(payload), { name, ts: Date.now() }));
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

  // src/abort.js
  function abortError() {
    return Object.assign(new Error("请求已停止"), { name: "AbortError" });
  }
  function throwIfAborted(signal) {
    if (signal?.aborted) throw abortError();
  }
  function withAbort(value, signal) {
    return signal ? new Promise((resolve, reject) => {
      let stop = () => {
        signal.removeEventListener("abort", stop), reject(abortError());
      };
      signal.addEventListener("abort", stop, { once: !0 }), Promise.resolve(value).then(resolve, reject).finally(() => signal.removeEventListener("abort", stop)), signal.aborted && stop();
    }) : Promise.resolve(value);
  }
  function abortableDelay(ms, signal) {
    return throwIfAborted(signal), new Promise((resolve, reject) => {
      let timer = setTimeout(() => {
        signal?.removeEventListener("abort", stop), resolve();
      }, ms), stop = () => {
        clearTimeout(timer), signal.removeEventListener("abort", stop), reject(abortError());
      };
      signal?.addEventListener("abort", stop, { once: !0 });
    });
  }

  // src/site.js
  var site_exports = {};
  __export(site_exports, {
    ROUTES: () => ROUTES,
    SEL: () => SEL,
    USER_TABS: () => USER_TABS,
    detectPage: () => detectPage,
    listPages: () => listPages,
    parseLikeTargets: () => parseLikeTargets,
    parseList: () => parseList,
    parseListItem: () => parseListItem,
    parseNotifications: () => parseNotifications,
    parsePost: () => parsePost,
    parseTopic: () => parseTopic,
    parseTopicFavoriteState: () => parseTopicFavoriteState,
    parseUser: () => parseUser,
    parseUserReplies: () => parseUserReplies,
    readCsrf: () => readCsrf,
    readCurrentUser: () => readCurrentUser,
    readForums: () => readForums,
    snapshot: () => snapshot
  });

  // src/site/routes.js
  var ROUTES = {
    home: "/",
    homeSorted: (sort = "post", p = 1) => `/index.php?sort=${sort}${p > 1 ? `&p=${p}` : ""}`,
    forum: (id, { sort, p } = {}) => {
      let q = [];
      return sort && q.push(`sort=${sort}`), p && p > 1 && q.push(`p=${p}`), `/forum/${id}${q.length ? `?${q.join("&")}` : ""}`;
    },
    topic: (id, p = 1) => `/topic/${id}${p > 1 ? `?p=${p}` : ""}`,
    topicReply: (topicId, postId) => {
      let topic = Number(topicId), post = Number(postId);
      if (!Number.isSafeInteger(topic) || topic <= 0 || !Number.isSafeInteger(post) || post <= 0)
        throw new Error("主题或回帖路由 ID 无效");
      return `/topic/${topic}?replyid=${post}`;
    },
    user: (id, tab, p = 1) => {
      let uid2 = Number(id), page = Number(p);
      if (!Number.isSafeInteger(uid2) || uid2 <= 0 || !Number.isSafeInteger(page) || page < 1)
        throw new Error("用户路由 ID 或页码无效");
      if (tab != null && !USER_TABS.includes(String(tab))) throw new Error("用户路由 tab 无效");
      let q = new URLSearchParams();
      tab && q.set("tab", String(tab)), page > 1 && q.set("p", String(page));
      let suffix = q.toString();
      return `/user/${uid2}${suffix ? `?${suffix}` : ""}`;
    },
    forumList: "/forum_list",
    profile: "/profile",
    topicEdit: "/topic_edit",
    search: "/search",
    searchResults: (query, field, p = 1) => {
      let q = String(query || "").trim(), page = Number(p);
      if (!q || !["title", "body", "reply"].includes(String(field))) throw new Error("搜索结果路由参数无效");
      if (!Number.isSafeInteger(page) || page < 1) throw new Error("搜索结果页码无效");
      let params = new URLSearchParams({ q, field: String(field) });
      return page > 1 && params.set("p", String(page)), `/index.php?${params.toString()}`;
    },
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
    hotDiscussions: "/hot_discussions",
    footprint: "/unread_topic_notice_footprint",
    collections: "/topic_collections",
    collection: (id) => `/topic_collection/${id}`,
    identity: "/identity_center",
    promotions: "/promotions",
    essenceReview: "/topic_essence_review_list",
    colorScheme: "/color_scheme",
    keywordFilter: "/home_keyword_filter_settings",
    messages: "/direct_messages",
    userBlock: "/user_block",
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
  }, USER_TABS = ["topics", "replies", "attachments", "notifications", "points_rewards", "favorites"];
  function listPages(root = document) {
    let doc = root?.nodeType === 9 ? root : root?.ownerDocument, baseHref = doc?.location?.href || doc?.defaultView?.location?.href || "https://linux.sb/", origin = (() => {
      try {
        return new URL(baseHref).origin;
      } catch {
        return "https://linux.sb";
      }
    })(), pages = /* @__PURE__ */ new Set([1]);
    for (let anchor of root?.querySelectorAll?.(".pagination a[href]") || []) {
      let href = anchor.getAttribute("href");
      try {
        let url = new URL(href, baseHref);
        if (url.origin !== origin) continue;
        let page = Number(url.searchParams.get("p"));
        Number.isSafeInteger(page) && page > 0 && pages.add(page);
      } catch {
      }
    }
    return [...pages].sort((a, b) => a - b);
  }

  // src/site/selectors.js
  var SEL = {
    topicPosts: "ul.topic-post-list > li.post-entry:not(.reply-pin-duplicate), ul.post-list > li.post-entry:not(.reply-pin-duplicate)",
    topicUl: "ul.topic-post-list, ul.post-list",
    listItems: "ul.post-list > li.post-item:not(.post-entry):not(.topic-collections-collection-row)",
    listUl: "ul.post-list",
    postEntry: "li.post-entry"
  };

  // src/site/chrome.js
  function detectPage(loc = location) {
    let path = loc.pathname.replace(/\/+$/, "") || "/", q = new URLSearchParams(loc.search), mTopic = path.match(/^\/topic\/(\d+)$/);
    if (mTopic) return { type: "topic", id: Number(mTopic[1]), page: Number(q.get("p") || 1) };
    let mCollection = path.match(/^\/topic_collection\/(\d+)$/);
    if (mCollection) return { type: "collection", id: Number(mCollection[1]) };
    let mForum = path.match(/^\/forum\/(\d+)$/);
    if (mForum)
      return {
        type: "forum",
        id: Number(mForum[1]),
        page: Number(q.get("p") || 1),
        sort: q.get("sort") || "comment"
      };
    let mUser = path.match(/^\/user\/(\d+)$/);
    if (mUser) return { type: "user", id: Number(mUser[1]), tab: q.get("tab") || "topics" };
    if (path === "/" || path === "/index.php")
      return { type: "home", page: Number(q.get("p") || 1), sort: q.get("sort") || "post" };
    if (path === "/topic_collections") return { type: "collections", tab: q.get("tab") || "mine" };
    let known = {
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
      "/hot_discussions": "hot_discussions",
      "/unread_topic_notice_footprint": "footprint",
      "/identity_center": "identity",
      "/promotions": "promotions",
      "/topic_essence_review_list": "essence_review",
      "/color_scheme": "color_scheme",
      "/home_keyword_filter_settings": "keyword_filter",
      "/direct_messages": "messages",
      "/user_block": "user_block"
    };
    return known[path] ? { type: known[path] } : /^\/notify\/\d+$/.test(path) ? { type: "notify", id: num(path) } : /^\/content_report\/\d+$/.test(path) ? { type: "report", id: num(path) } : { type: "unknown", path };
  }
  function readCsrf(doc = document) {
    let el = doc.querySelector('input[name="_csrf"]');
    return el ? el.value : null;
  }
  function readCurrentUser(doc = document) {
    let uidOf = (a) => a ? idFrom(a.getAttribute("href"), "user") : null, strategies = [
      // A. 「我的主页」直链（旧版移动端抽屉，改版后可能仍在别处）
      () => uidOf([...doc.querySelectorAll('a[href*="/user/"]')].find((a) => text(a) === "我的主页")),
      // B. 「我的主题/回帖/收藏/通知/积分」这类自指链接，措辞带「我的」即锁定本人
      () => uidOf(
        [...doc.querySelectorAll('a[href*="/user/"]')].find((a) => {
          let s = text(a);
          return /^我的(主题|回帖|收藏|通知|积分|称号)/.test(s);
        })
      ),
      // C. 侧栏用户卡 + 登录专属入口（/profile 个人设置、发帖按钮）同时存在 → 卡片即本人
      () => doc.querySelector('a[href="/profile"]') || doc.querySelector('a.btn-post[href="/topic_edit"]') || doc.querySelector('a[href="/daily_checkin"]') ? uidOf(doc.querySelector(".sidebar-card.user-card a.user-name")) : null
    ], myUid = null;
    for (let fn of strategies) {
      try {
        myUid = fn();
      } catch {
        myUid = null;
      }
      if (myUid != null) break;
    }
    let card = doc.querySelector(".sidebar-card.user-card"), cardLink = card?.querySelector("a.user-name"), cardUid = uidOf(cardLink), isSelfCard = myUid != null && cardUid === myUid, rank = text(card?.querySelector(".user-rank"));
    return {
      guest: myUid == null,
      uid: myUid,
      name: isSelfCard ? text(cardLink) : null,
      rank: isSelfCard ? rank : null,
      points: isSelfCard ? num(rank.split("·")[1] || "") : null,
      group: isSelfCard && (rank.split("·")[0] || "").trim() || null,
      avatar: isSelfCard && card?.querySelector(".avatar-img")?.getAttribute("src") || null
    };
  }
  function readForums(doc = document) {
    let out = /* @__PURE__ */ new Map(), sel = '.forum-nav a[href^="/forum/"], #mobile-menu-drawer a[href^="/forum/"], .forum-more-region a[href^="/forum/"]';
    for (let a of doc.querySelectorAll(sel)) {
      let id = idFrom(a.getAttribute("href"), "forum");
      id && !out.has(id) && out.set(id, { id, name: text(a) });
    }
    let counted = '.forum-enhancements-sidebar-list a[href^="/forum/"], a.forum-enhancements-link[href^="/forum/"]';
    for (let a of doc.querySelectorAll(counted)) {
      let id = idFrom(a.getAttribute("href"), "forum");
      if (!id) continue;
      let nameEl = a.querySelector(".forum-enhancements-sidebar-name, .forum-enhancements-name"), countEl = a.querySelector(".forum-enhancements-sidebar-count, .forum-enhancements-count"), rec = out.get(id) || { id, name: nameEl ? text(nameEl) : text(a) };
      if (nameEl && (rec.name = text(nameEl)), countEl) {
        let n = num(text(countEl));
        Number.isFinite(n) && (rec.topics = n);
      }
      out.set(id, rec);
    }
    return [...out.values()].sort((a, b) => a.id - b.id);
  }

  // src/site/parsers.js
  function parseListItem(li) {
    if (li.classList.contains("post-entry") || li.classList.contains("topic-collections-collection-row")) return null;
    let titleA = li.querySelector("a.post-title:not(.post-author)");
    if (!titleA || /\/topic_collection\//.test(titleA.getAttribute("href") || "")) return null;
    let authorA = li.querySelector('.post-avatar a[href^="/user/"]') || li.querySelector('.post-meta a[href^="/user/"]'), forumA = li.querySelector('.post-forum-meta a[href^="/forum/"], .post-meta a[href^="/forum/"]'), stamp = li.querySelector("span[data-performance-time]"), counts = [...li.querySelectorAll(".post-meta span")].map((s) => text(s)).filter((t) => /^\d[\d,]*$/.test(t)).map(num), redEl = li.querySelector(".red-packet-title-status"), cardEl = li.querySelector(".virtual-card-title-status"), blob = (el) => el ? `${el.className} ${text(el)}` : "", redPacket = redEl ? /结束|已抢|抢完|已领|ended|expired/i.test(blob(redEl)) ? "ended" : "live" : null, cardBlob = blob(cardEl), virtualCard = cardEl ? cardEl.classList.contains("finished") || /结束|已结束|已发完|ended|expired/i.test(cardBlob) ? "ended" : cardEl.classList.contains("active") || /发卡中|发放中/.test(text(cardEl)) ? "live" : "ended" : null;
    return {
      id: idFrom(titleA.getAttribute("href"), "topic"),
      title: text(titleA),
      url: titleA.getAttribute("href"),
      authorId: authorA ? idFrom(authorA.getAttribute("href"), "user") : null,
      authorName: authorA && (text(authorA) || authorA.querySelector("img")?.getAttribute("alt")) || null,
      forumId: forumA ? idFrom(forumA.getAttribute("href"), "forum") : null,
      forumName: forumA ? text(forumA) : null,
      replies: counts.length ? counts[counts.length - 1] : null,
      lastActiveTs: stamp ? num(stamp.getAttribute("data-performance-time")) : null,
      pinned: li.classList.contains("topic-pinned") || !!li.querySelector(".topic-badge.pinned"),
      badges: [...li.querySelectorAll(".topic-stamp-badge, .red-packet-title-status, .virtual-card-title-status")].map(
        (b) => text(b)
      ),
      marks: { redPacket, virtualCard },
      el: li
    };
  }
  function parseList(root = document) {
    return [...root.querySelectorAll(SEL.listItems)].map(parseListItem).filter((x) => x && x.id);
  }
  function postLikeCount(li) {
    if (li.querySelector("[data-like-coin-action]")) return num(text(li.querySelector(".like-coin-count")));
    let donate = li.querySelector(".donate-topic-reaction-count, [data-donate-topic-like-count]");
    if (donate) {
      let n = num(text(donate));
      return Number.isFinite(n) ? n : num(donate.getAttribute("data-donate-topic-like-count"));
    }
    return null;
  }
  function parsePost(li) {
    let idm = (li.id || "").match(/^post-(\d+)$/), authorA = li.querySelector("a.post-title.post-author") || li.querySelector('.post-avatar a[href^="/user/"]'), stamp = li.querySelector("span[data-performance-time]"), likeBtn = li.querySelector("[data-like-coin-action]");
    return {
      postId: idm ? Number(idm[1]) : null,
      floor: li.dataset?.floor ? Number(li.dataset.floor) : 0,
      authorId: authorA ? idFrom(authorA.getAttribute("href"), "user") : null,
      authorName: authorA && (text(authorA) || authorA.querySelector("img")?.getAttribute("alt")) || null,
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
    let stats = [...doc.querySelectorAll(".post-content-stats span")].map((s) => num(text(s))), crumbForum = [...doc.querySelectorAll('.breadcrumb a[href^="/forum/"]')].pop(), posts = [...doc.querySelectorAll(SEL.topicPosts)].map(parsePost), pages = [...doc.querySelectorAll('.pagination a[href*="p="]')].reduce(
      (mx, a) => Math.max(mx, num((a.getAttribute("href").match(/[?&]p=(\d+)/) || [])[1])),
      1
    ), docHref = doc.location?.href || doc.defaultView?.location?.href || "https://linux.sb/", parsePage = (href) => {
      try {
        let base = new URL(docHref), url = new URL(href, base);
        if (url.origin !== base.origin) return null;
        let values = url.searchParams.getAll("p");
        if (values.length !== 1 || !/^\d+$/.test(values[0])) return null;
        let page = Number(values[0]);
        return Number.isSafeInteger(page) && page > 0 ? page : null;
      } catch {
        return null;
      }
    }, currentPage = parsePage(docHref) ?? parsePage(doc.querySelector(".pagination li.active a[href]")?.getAttribute("href") || "") ?? 1;
    return {
      id: idFrom(doc.querySelector('link[rel="canonical"]')?.getAttribute("href") || "", "topic") ?? (posts[0] ? posts[0].postId : null),
      title: text(doc.querySelector("h1.post-content-title")),
      forumId: crumbForum ? idFrom(crumbForum.getAttribute("href"), "forum") : null,
      forumName: crumbForum ? text(crumbForum) : null,
      views: stats[0] ?? null,
      replies: stats[1] ?? null,
      pages,
      currentPage,
      op: posts[0] || null,
      posts,
      replyForm: !!doc.querySelector("form.ajax-reply-form"),
      loginRequired: !doc.querySelector("form.ajax-reply-form")
    };
  }
  function parseUser(doc = document) {
    let card = doc.querySelector(".sidebar-card.user-card"), link = card?.querySelector("a.user-name"), rank = text(card?.querySelector(".user-rank"));
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
  function parseUserReplies(root = document, expectedUserId = null) {
    let doc = root?.nodeType === 9 ? root : root?.ownerDocument;
    if (!doc) return [];
    let activeTab = root.querySelector(".tab-bar a.tab.active[href]");
    if (!activeTab) return [];
    let activeHref = activeTab.getAttribute("href") || "", pageUrl;
    try {
      let href = doc.location?.href || doc.defaultView?.location?.href;
      if (href && /^https?:\/\//i.test(href))
        pageUrl = new URL(href);
      else {
        if (!/^\/(?!\/)/.test(activeHref)) return [];
        pageUrl = new URL(activeHref, "https://linux.sb/");
      }
    } catch {
      return [];
    }
    let userPath = pageUrl.pathname.match(/^\/user\/(\d+)$/);
    if (expectedUserId != null) {
      let expectedId = Number(expectedUserId);
      if (!Number.isSafeInteger(expectedId) || expectedId <= 0 || Number(userPath?.[1]) !== expectedId) return [];
    }
    if (!userPath || pageUrl.searchParams.getAll("tab").length !== 1 || pageUrl.searchParams.get("tab") !== "replies") return [];
    try {
      let activeUrl = new URL(activeHref, pageUrl);
      if (activeUrl.origin !== pageUrl.origin || activeUrl.pathname !== pageUrl.pathname || activeUrl.searchParams.getAll("tab").length !== 1 || activeUrl.searchParams.get("tab") !== "replies") return [];
    } catch {
      return [];
    }
    let replies = [], seen = /* @__PURE__ */ new Set();
    for (let row of root.querySelectorAll(".forum-main ul.post-list > li.post-item")) {
      let anchor = row.querySelector("a.post-title[href]");
      if (anchor)
        try {
          let url = new URL(anchor.getAttribute("href"), pageUrl), topicMatch = url.pathname.match(/^\/topic\/(\d+)$/), postValues = url.searchParams.getAll("replyid"), topicId = Number(topicMatch?.[1]), postId = Number(postValues[0]);
          if (url.origin !== pageUrl.origin || !topicMatch || url.searchParams.size !== 1 || postValues.length !== 1 || !Number.isSafeInteger(topicId) || topicId <= 0 || !Number.isSafeInteger(postId) || postId <= 0) continue;
          let key = `${topicId}:${postId}`, topicTitle = text(anchor).slice(0, 240);
          if (!topicTitle || seen.has(key)) continue;
          seen.add(key), replies.push({ postId, topicId, topicTitle });
        } catch {
        }
    }
    return replies;
  }
  function parseNotifications(root = document) {
    return [...root.querySelectorAll("li.notification-item")].map((el) => {
      let topicA = el.querySelector('a[href*="/topic/"]'), href = topicA ? topicA.getAttribute("href") : "", content = el.querySelector(".notification-content");
      return {
        id: href ? idFrom(href, "topic") : null,
        title: content ? text(content) : text(el),
        href,
        unread: el.classList.contains("unread")
      };
    });
  }
  function parseLikeTargets(doc = document) {
    let coins = [...doc.querySelectorAll("[data-like-coin-action]")].map((btn) => {
      let tiers = [...new Set((btn.getAttribute("data-like-coin-tiers") || "").split(",").map((value) => value.trim()).filter((value) => /^\d+$/.test(value)).map(Number).filter((value) => Number.isSafeInteger(value) && value > 0))], likedValue = btn.getAttribute("data-like-coin-liked");
      return {
        type: btn.getAttribute("data-like-coin-type"),
        id: num(btn.getAttribute("data-like-coin-id")),
        tiers,
        liked: likedValue === "1" ? !0 : likedValue === "0" ? !1 : null,
        coined: num(btn.getAttribute("data-like-coin-coined")),
        count: num(text(btn.parentElement?.querySelector(".like-coin-count"))),
        el: btn
      };
    });
    return coins.length ? coins : [...doc.querySelectorAll("[data-donate-btn]")].map((btn) => {
      let replyRaw = btn.getAttribute("data-donate-reply-id"), topicRaw = btn.getAttribute("data-donate-topic-id"), id = replyRaw != null && replyRaw !== "" ? num(replyRaw) : num(topicRaw), countEl = btn.querySelector(".donate-topic-reaction-count") || btn;
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
  function parseTopicFavoriteState(doc = document) {
    if (!doc?.querySelectorAll) return null;
    let currentHref = doc.location?.href || doc.defaultView?.location?.href || "", base;
    try {
      base = /^https?:\/\//i.test(currentHref) ? new URL(currentHref) : new URL("https://linux.sb/");
    } catch {
      base = new URL("https://linux.sb/");
    }
    let forms = [...doc.querySelectorAll("form.topic-favorites-action, form[action]")].filter((form) => {
      if (String(form.method || "").toLowerCase() !== "post") return !1;
      try {
        let action = new URL(form.getAttribute("action") || base.href, base);
        return action.origin === base.origin && action.pathname === ROUTES.post.favorite && !action.search && !action.hash;
      } catch {
        return !1;
      }
    });
    if (forms.length !== 1) return null;
    let buttons = forms[0].querySelectorAll('button.fav-btn, input[type="submit"].fav-btn');
    if (buttons.length !== 1 || buttons[0].disabled) return null;
    let button = buttons[0], state = String(button.getAttribute("data-favorite-state") || button.getAttribute("data-favorited") || "").trim().toLowerCase();
    if (["1", "true", "favorited", "saved"].includes(state)) return !0;
    if (["0", "false", "not-favorited", "unsaved"].includes(state)) return !1;
    let pressed = button.getAttribute("aria-pressed");
    if (pressed === "true") return !0;
    if (pressed === "false") return !1;
    if (button.classList.contains("active") || button.classList.contains("is-favorited")) return !0;
    let label = `${button.getAttribute("aria-label") || ""} ${button.getAttribute("title") || ""} ${text(button)}`.trim();
    return /取消收藏|已收藏/.test(label) ? !0 : /^收藏(?:主题)?(?:\s+收藏(?:主题)?)?$/.test(label) ? !1 : null;
  }

  // src/site/snapshot.js
  function snapshot(doc = document, loc = location, prev = null) {
    let page = detectPage(loc), same = prev?.page?.type === page.type && (prev.page.id ?? null) === (page.id ?? null), snap = {
      page,
      csrf: readCsrf(doc),
      me: readCurrentUser(doc),
      forums: same && prev.forums ? prev.forums : readForums(doc),
      version: doc.querySelector('link[href*="index.css?v="]')?.getAttribute("href")?.match(/v=v?([\d.]+)/)?.[1] || null
    };
    return page.type === "topic" && (snap.topic = same && prev.topic ? prev.topic : parseTopic(doc)), page.type === "user" && (snap.user = same && prev.user ? prev.user : parseUser(doc)), (page.type === "home" || page.type === "forum" || page.type === "featured" || page.type === "hot_discussions" || page.type === "footprint") && (snap.list = same && prev.list ? prev.list : parseList(doc)), snap;
  }

  // src/net.js
  var WRITE_MESSAGE_LIMIT = 240;
  function normalizeRequestUrl(path, origin) {
    let raw = String(path ?? ""), url;
    try {
      url = new URL(raw, origin);
    } catch {
      throw new Error(`请求 URL 无效：${raw.slice(0, 160)}`);
    }
    if (!["http:", "https:"].includes(url.protocol))
      throw new Error(`请求 URL 协议不受支持：${url.protocol || "unknown"}`);
    if (url.username || url.password)
      throw new Error("请求 URL 不得包含用户名或密码");
    if (url.hash)
      throw new Error("请求 URL 不得包含 hash fragment");
    return url.href;
  }
  function writeMessage(value) {
    return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, WRITE_MESSAGE_LIMIT);
  }
  function safeWriteRedirect(value, origin) {
    if (!value) return "";
    try {
      let url = new URL(String(value), origin);
      return url.origin !== origin || url.hash || !(/^\/topic\/\d+(?:\/)?$/.test(url.pathname) || /^\/forum\/\d+(?:\/)?$/.test(url.pathname) || /^\/user\/\d+(?:\/)?$/.test(url.pathname) || /^\/index\.php$/.test(url.pathname) || /^\/topic_edit\/?$/.test(url.pathname) || /^\/daily_checkin\/?$/.test(url.pathname)) ? "" : url.pathname + url.search;
    } catch {
      return "";
    }
  }
  function classifyWriteResponse(response, { actionPath = "" } = {}) {
    let status = Number(response?.status), output = { outcome: "unknown", status: Number.isFinite(status) ? status : 0 };
    if (!Number.isFinite(status) || status <= 0) return output;
    let raw = String(response?.text || ""), data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
    if (status >= 500) return { ...output, outcome: "unknown", message: `HTTP ${status}` };
    if (status < 200 || status >= 300)
      return {
        ...output,
        outcome: "failure",
        message: writeMessage(data?.message || data?.tip || `HTTP ${status}`)
      };
    if (status === 204 || !data || typeof data != "object" || Array.isArray(data)) return output;
    let explicit = data.ok, message = writeMessage(data.message || data.tip), origin = "https://linux.sb";
    try {
      origin = new URL(String(response?.url || origin), origin).origin;
    } catch {
    }
    let redirect = safeWriteRedirect(data.redirect, origin);
    return explicit === !0 || explicit === 1 || explicit === "1" ? { ...output, outcome: "success", message, ...redirect ? { redirect } : {} } : explicit === !1 || explicit === 0 || explicit === "0" ? { ...output, outcome: "failure", message: message || `本站拒绝了${actionPath || "写入"}请求` } : { ...output, message, ...redirect ? { redirect } : {} };
  }
  var Net = class {
    constructor({ origin = location.origin, rate = 900, log = () => {
    }, gmRequest = null } = {}) {
      this.origin = origin, this.rate = rate, this.log = log, this.gmRequest = gmRequest, this._queue = Promise.resolve(), this._last = 0, this._csrf = null, this._inflight = /* @__PURE__ */ new Map(), this._signalIds = /* @__PURE__ */ new WeakMap(), this._nextSignalId = 1;
    }
    setCsrf(token) {
      this._csrf = token || null;
    }
    classifyWrite(response, opts = {}) {
      return classifyWriteResponse(response, opts);
    }
    csrf() {
      return this._csrf || (this._csrf = readCsrf(document)), this._csrf;
    }
    /** 全局串行闸门：无论谁调用，都排队按 rate 出队 */
    _gate(task, signal) {
      let run = this._queue.then(async () => {
        throwIfAborted(signal);
        let wait = this.rate - (Date.now() - this._last);
        return wait > 0 && await abortableDelay(wait, signal), throwIfAborted(signal), this._last = Date.now(), task();
      });
      return this._queue = run.then(() => {
      }, () => {
      }), withAbort(run, signal);
    }
    _url(path) {
      return normalizeRequestUrl(path, this.origin);
    }
    _inflightKey(url, signal) {
      if (!signal || typeof signal != "object" && typeof signal != "function") return `GET ${url}`;
      let id = this._signalIds.get(signal);
      return id || (id = this._nextSignalId++, this._signalIds.set(signal, id)), `GET ${url} signal:${id}`;
    }
    _sameOrigin(url) {
      try {
        return new URL(url, this.origin).origin === this.origin;
      } catch {
        return !1;
      }
    }
    /** 供权限层判定「这是站内请求还是站外请求」（core 的 write/net 分流依据） */
    isSameOrigin(path) {
      return this._sameOrigin(this._url(path));
    }
    /**
     * 仅供 Platform v2 RequestBroker 使用的传输委托。
     * 不增加新的端点语义，仍由 raw 统一执行限速、取消、重试和 GM/fetch 选择。
     */
    transport(path, opts = {}) {
      return this.raw(path, opts);
    }
    async raw(path, { method = "GET", body = null, headers = {}, external = !1, retry, timeout = 2e4, backoff, queue, signal, onChunk } = {}) {
      throwIfAborted(signal);
      let url = this._url(path);
      if (!this._sameOrigin(url) && !external)
        throw new Error(`跨域请求被拒绝：${url}（需 external:true 且脚本已 @connect）`);
      let idempotent = method === "GET" || method === "HEAD";
      retry == null && (retry = idempotent ? 2 : 0);
      let bo = { rate: 1500, err: 800, ...backoff || {} }, isExternal = !this._sameOrigin(url), useQueue = queue == null ? !isExternal : !!queue, delivered = !1, notify = typeof onChunk == "function" ? (chunk) => {
        throwIfAborted(signal), chunk && (delivered = !0, onChunk(chunk));
      } : null, attempt = async () => {
        let lastErr;
        for (let i = 0; i <= retry; i++) {
          throwIfAborted(signal);
          try {
            let res = isExternal && this.gmRequest ? await this._viaGm(url, { method, body, headers, timeout, signal, onChunk: notify }) : await this._viaFetch(url, { method, body, headers, timeout, signal, onChunk: notify });
            if (throwIfAborted(signal), res.status === 429 || res.status === 503) {
              if (i === retry) return res;
              this.log(`限流 ${res.status}，退避重试 ${i + 1}/${retry}`), await abortableDelay(bo.rate * (i + 1), signal), lastErr = new Error(`HTTP ${res.status}`);
              continue;
            }
            return res;
          } catch (e) {
            if (throwIfAborted(signal), delivered) throw e;
            if (lastErr = e, i === retry) break;
            await abortableDelay(bo.err * (i + 1), signal);
          }
        }
        throw lastErr;
      };
      return useQueue ? this._gate(attempt, signal) : attempt();
    }
    async _viaFetch(url, { method, body, headers, timeout, signal, onChunk }) {
      throwIfAborted(signal);
      let ctrl = new AbortController(), stop = () => ctrl.abort();
      signal?.addEventListener("abort", stop, { once: !0 });
      let timer = setTimeout(() => ctrl.abort(), timeout);
      try {
        let res = await withAbort(fetch(url, {
          method,
          body,
          headers,
          credentials: "same-origin",
          redirect: "follow",
          signal: ctrl.signal
        }), ctrl.signal), text4 = "";
        if (onChunk && res.ok && res.body?.getReader && typeof TextDecoder == "function") {
          let reader = res.body.getReader(), decoder = new TextDecoder();
          try {
            for (; ; ) {
              let { done, value } = await withAbort(reader.read(), ctrl.signal), chunk = done ? decoder.decode() : decoder.decode(value, { stream: !0 });
              if (text4 += chunk, text4.length > 1e6) throw new Error("流式响应超过长度上限");
              if (throwIfAborted(ctrl.signal), chunk && onChunk(chunk), done) break;
            }
          } catch (error) {
            throw reader.cancel().catch(() => {
            }), error;
          } finally {
            reader.releaseLock?.();
          }
        } else if (text4 = await withAbort(res.text(), ctrl.signal), throwIfAborted(ctrl.signal), onChunk && res.ok) {
          if (text4.length > 1e6) throw new Error("流式响应超过长度上限");
          onChunk(text4);
        }
        return throwIfAborted(ctrl.signal), { status: res.status, ok: res.ok, url: res.url, text: text4 };
      } finally {
        clearTimeout(timer), signal?.removeEventListener("abort", stop);
      }
    }
    _viaGm(url, { method, body, headers, timeout, signal, onChunk }) {
      throwIfAborted(signal);
      let data = body;
      return body && typeof body != "string" && typeof FormData < "u" && !(body instanceof FormData) && (data = JSON.stringify(body)), new Promise((resolve, reject) => {
        let settled = !1, handle, offset = 0, finish = (fn, value) => {
          settled || (settled = !0, signal?.removeEventListener("abort", stop), fn(value));
        }, stop = () => {
          finish(reject, abortError());
          try {
            handle?.abort?.();
          } catch {
          }
        }, fail = (why) => finish(
          reject,
          new Error(
            `GM 请求失败: ${url}（${why}。氢需 @connect 该域名，请确认已更新氢脚本并允许跨域）`
          )
        );
        signal?.addEventListener("abort", stop, { once: !0 });
        let progress = (r) => {
          if (settled || !onChunk || r?.status < 200 || r?.status >= 300) return;
          let text4 = String(r?.responseText || "");
          if (!(text4.length < offset))
            try {
              if (text4.length > 1e6) throw new Error("流式响应超过长度上限");
              let end = /[\uD800-\uDBFF]$/.test(text4) ? text4.length - 1 : text4.length, chunk = text4.slice(offset, end);
              offset = end, chunk && onChunk(chunk);
            } catch (error) {
              finish(reject, error);
              try {
                handle?.abort?.();
              } catch {
              }
            }
        };
        try {
          handle = this.gmRequest({
            url,
            method,
            data,
            headers,
            timeout,
            anonymous: !0,
            responseType: "text",
            onprogress: progress,
            onreadystatechange: progress,
            onload: (r) => {
              if (!settled) {
                if (!r || !r.status) return fail(r?.error || "status 0，多半是域名未放行");
                progress(r), finish(resolve, { status: r.status, ok: r.status >= 200 && r.status < 300, url, text: r.responseText });
              }
            },
            onerror: (r) => fail(r?.error || r?.status || "网络失败或被油猴拦截"),
            ontimeout: () => finish(reject, new Error(`GM 请求超时: ${url}`)),
            onabort: () => finish(reject, abortError())
          });
        } catch (error) {
          finish(reject, error);
        }
        signal?.aborted && stop();
      });
    }
    /** 取 HTML 并解析为 Document（不执行脚本、不加载子资源） */
    async doc(path, opts = {}) {
      let key = this._inflightKey(this._url(path), opts.signal);
      if (this._inflight.has(key)) return this._inflight.get(key);
      let p = (async () => {
        let res = await this.raw(path, opts);
        if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
        let d = new DOMParser().parseFromString(res.text, "text/html"), t = readCsrf(d);
        return t && (this._csrf = t), d;
      })();
      this._inflight.set(key, p);
      try {
        return await p;
      } finally {
        this._inflight.delete(key);
      }
    }
    async json(path, opts = {}) {
      let res = await this.raw(path, {
        ...opts,
        headers: { accept: "application/json", ...opts.headers || {} }
      });
      try {
        return JSON.parse(res.text);
      } catch {
        throw new Error(`${path} 返回非 JSON（HTTP ${res.status}）`);
      }
    }
    /** 固定站内搜索语义：POST /search 后只接受同源的已知 redirect。 */
    async search(query, field = "title", opts = {}) {
      let q = String(query || "").trim();
      if (!q || q.length > 120 || /[\u0000-\u001f\u007f]/.test(q)) throw new Error("关键词长度或字符不合法");
      if (!["title", "body", "reply"].includes(field)) throw new Error("搜索字段不合法");
      let res = await this.form(ROUTES.post.search, { q, field }, opts);
      if (!res?.ok) throw new Error(`HTTP ${Number(res?.status) || 0}`);
      let parsed;
      try {
        parsed = JSON.parse(res.text || "{}");
      } catch {
        throw new Error("搜索接口返回异常");
      }
      if (!(parsed && (parsed.ok === !0 || parsed.ok === 1 || parsed.ok === "1")))
        throw new Error(String(parsed?.message || parsed?.tip || "搜索接口返回异常"));
      let target;
      try {
        target = new URL(parsed.redirect || "", this.origin);
      } catch {
        throw new Error("搜索接口返回了未知 redirect");
      }
      let targetPath = target.pathname + target.search;
      if (target.origin !== this.origin || !/^\/(?:index\.php|search)(?:\?|$)/.test(targetPath))
        throw new Error("搜索接口返回了站外或未知 redirect");
      return { url: targetPath, doc: await this.doc(targetPath, opts) };
    }
    /** 表单 POST，自动带 _csrf。fields 为普通对象或 FormData */
    async form(path, fields = {}, opts = {}) {
      let fd = fields instanceof FormData ? fields : new FormData();
      if (!(fields instanceof FormData))
        for (let [k, v] of Object.entries(fields))
          v != null && fd.append(k, v);
      if (!fd.has("_csrf")) {
        let token = this.csrf();
        if (!token) throw new Error("缺少 _csrf：当前页面未登录或未渲染表单");
        fd.append("_csrf", token);
      }
      return await this.raw(path, {
        method: "POST",
        body: fd,
        headers: { "x-requested-with": "XMLHttpRequest", ...opts.headers || {} },
        ...opts
      });
    }
  }, Actions = class {
    constructor(net) {
      this.net = net;
    }
    async _write(path, fields) {
      let res = await this.net.form(path, fields), parsed = classifyWriteResponse(res, { actionPath: path });
      return {
        ok: parsed.outcome === "success",
        outcome: parsed.outcome,
        status: parsed.status,
        ...parsed.message ? { message: parsed.message } : {},
        ...parsed.redirect ? { redirect: parsed.redirect } : {}
      };
    }
    /** 回复帖子 */
    async reply(topicId, body, extra = {}) {
      if (!body || !String(body).trim()) throw new Error("回复内容不能为空");
      return this._write(ROUTES.post.reply, { topic_id: topicId, body, ...extra });
    }
    /** 发布新主题 */
    async topic(forumId, title, body, extra = {}) {
      if (!title || !String(title).trim()) throw new Error("主题标题不能为空");
      if (!body || !String(body).trim()) throw new Error("主题内容不能为空");
      return this._write(ROUTES.post.topic, { forum_id: forumId, title, body, ...extra });
    }
    /** 收藏 / 取消收藏（服务端切换） */
    async toggleFavorite(topicId) {
      return this._write(ROUTES.post.favorite, { topic_id: topicId });
    }
    /** 点赞或投币；type: 'topic' | 'reply'，coin 为投币数（0 = 仅点赞） */
    async likeCoin({ type = "reply", id, coin = 0 }) {
      return this._write(ROUTES.post.likeCoin, {
        like_coin_type: type,
        like_coin_id: id,
        ...coin ? { coin } : {}
      });
    }
    /** Markdown 预览（站点自带 /nb_editor_preview） */
    async preview(body) {
      return (await this.net.form(ROUTES.post.preview, { body })).text;
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
      let res = await this.net.form(ROUTES.post.search, { q, field }), j = null;
      try {
        j = JSON.parse(res.text || "");
      } catch {
      }
      if (!(j && j.ok && j.redirect))
        throw new Error("搜索接口返回异常：" + String(res.text || "").slice(0, 80));
      return await this.net.doc(j.redirect);
    }
    /** 打赏动态流 */
    async donateFeed(topicId, lastId = 0) {
      return this.net.json(`${ROUTES.donateFeed}?topic_id=${topicId}&last_id=${lastId}`);
    }
  };

  // src/runtime/redaction.js
  var DEFAULT_SENSITIVE = /(?:authorization|cookie|csrf|api[-_]?key|token|password|passwd|secret|credential|body|raw[-_]?query)/i, URL_RE = /^https?:\/\//i;
  function redactString(value) {
    let input = String(value);
    if (URL_RE.test(input))
      try {
        let url = new URL(input);
        return `${url.origin}${url.pathname}`;
      } catch {
      }
    return input.replace(/\b(?:Bearer|Basic)\s+[^\s]+/gi, "[redacted]").replace(/([?&](?:token|key|api_key|csrf|code|secret|password)=)[^&#\s]*/gi, "$1[redacted]");
  }
  function sanitizeDiagnostic(value, policy = {}) {
    let sensitive = policy.sensitiveKeys instanceof RegExp ? policy.sensitiveKeys : DEFAULT_SENSITIVE, maxDepth = Number.isFinite(policy.maxDepth) ? Math.max(1, policy.maxDepth) : 8, seen = /* @__PURE__ */ new WeakSet(), walk = (input, key, depth) => {
      if (key != null && sensitive.test(String(key))) return "[redacted]";
      if (input == null || typeof input == "boolean" || typeof input == "number") return input;
      if (typeof input == "string") return redactString(input);
      if (typeof input == "bigint") return `${input}n`;
      if (typeof input == "function" || typeof input == "symbol") return "[redacted]";
      if (depth >= maxDepth) return "[truncated]";
      if (seen.has(input)) return "[circular]";
      seen.add(input);
      let crossRealmError = Object.prototype.toString.call(input) === "[object Error]" || typeof input.message == "string" && typeof input.name == "string" && (input.name.endsWith("Error") || input.name === "DOMException");
      if (input instanceof Error || crossRealmError)
        return {
          name: redactString(input.name),
          code: input.code == null ? void 0 : redactString(input.code),
          message: redactString(input.message)
        };
      if (Array.isArray(input)) return input.map((item) => walk(item, null, depth + 1));
      if (input instanceof URL) return `${input.origin}${input.pathname}`;
      let out = {};
      for (let [childKey, childValue] of Object.entries(input)) out[childKey] = walk(childValue, childKey, depth + 1);
      return out;
    };
    return walk(value, null, 0);
  }

  // src/runtime/capabilities.js
  var CAPABILITIES = Object.freeze([
    "read",
    "write",
    "storage",
    "ui",
    "net",
    "admin",
    "events"
  ]), KNOWN = new Set(CAPABILITIES);
  function normalizeCapabilities(manifest) {
    let input = manifest?.permissions ?? manifest?.capabilities ?? [], values = Array.isArray(input) ? input : [];
    return Object.freeze([...new Set(values.map((value) => String(value)).filter((value) => KNOWN.has(value)))]);
  }
  function capabilityError(code, fields, message) {
    let error = new Error(message || code);
    error.code = code;
    for (let [key, value] of Object.entries(fields || {})) error[key] = value;
    return error;
  }
  function safePurpose(purpose) {
    return String(purpose || "未说明用途").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 120);
  }
  function createCapabilityContext(manifest = {}, services = {}) {
    let parent = services.parent || null, owner = String(manifest.id || services.owner || "anonymous"), capabilities = normalizeCapabilities(manifest), capabilitySet = new Set(capabilities), controller = new AbortController(), disposed = !1, parentStop = null, disposers = [], parentSignal = services.signal || parent?.signal;
    if (parentSignal) {
      let abort = () => controller.abort();
      parentStop = abort, parentSignal.aborted ? controller.abort() : parentSignal.addEventListener("abort", abort, { once: !0 });
    }
    let context = {
      owner,
      capabilities,
      signal: controller.signal,
      get disposed() {
        return disposed;
      },
      require(capability, purpose) {
        let name = String(capability || "");
        if (disposed)
          throw capabilityError("capability.disposed", { owner, capability: name, purpose: safePurpose(purpose) }, "能力上下文已停用");
        if (!capabilitySet.has(name))
          throw capabilityError(
            "capability.denied",
            { owner, capability: name, purpose: safePurpose(purpose) },
            `插件 ${owner} 未声明 '${name}' 权限，无法 ${safePurpose(purpose)}`
          );
        return !0;
      },
      child(purpose, allowed = capabilities) {
        if (disposed) throw capabilityError("capability.disposed", { owner, purpose: safePurpose(purpose) }, "能力上下文已停用");
        let requested = Array.isArray(allowed) ? [...new Set(allowed.map((value) => String(value)))] : [], escalation = requested.filter((name) => !capabilitySet.has(name));
        if (escalation.length)
          throw capabilityError(
            "capability.escalation",
            { owner, purpose: safePurpose(purpose), capabilities: Object.freeze(escalation) },
            "子上下文不能扩大能力范围"
          );
        let childContext = createCapabilityContext(
          { id: `${owner}/${safePurpose(purpose)}`, permissions: requested },
          { parent: context, signal: controller.signal }
        );
        return context.own(() => childContext.dispose()), childContext;
      },
      own(dispose) {
        if (typeof dispose != "function") throw new TypeError("能力清理器必须是函数");
        if (disposed) {
          try {
            dispose();
          } catch {
          }
          return dispose;
        }
        return disposers.push(dispose), dispose;
      },
      dispose() {
        if (!disposed) {
          disposed = !0, controller.abort(), parentSignal && parentStop && parentSignal.removeEventListener("abort", parentStop);
          for (let dispose of disposers.splice(0))
            try {
              dispose();
            } catch {
            }
        }
      },
      summary() {
        return Object.freeze({ owner, capabilities });
      }
    };
    return typeof services.onDispose == "function" && context.own(services.onDispose), parent && parent.own(() => context.dispose()), context;
  }

  // src/runtime/route-utils.js
  function snapshotValue(source) {
    try {
      return typeof source == "function" ? source() : source || {};
    } catch {
      return {};
    }
  }
  function routeFingerprint(snapshot2) {
    return snapshot2?.routeFingerprint ?? snapshot2?.route?.fingerprint ?? snapshot2?.page?.fingerprint ?? snapshot2?.page?.type;
  }

  // src/runtime/request-broker.js
  var METHODS = /* @__PURE__ */ new Set(["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"]), IDEMPOTENT = /* @__PURE__ */ new Set(["GET", "HEAD", "OPTIONS"]);
  function errorWith(code, message, fields = {}) {
    let error = new Error(message || code);
    return error.code = code, code === "request.aborted" && (error.name = "AbortError"), Object.assign(error, fields), error;
  }
  function nowOrigin(value) {
    if (value)
      try {
        return new URL(String(value)).origin;
      } catch {
      }
    try {
      return location.origin;
    } catch {
      return "https://linux.sb";
    }
  }
  function headersObject(headers) {
    return headers ? typeof headers.entries == "function" ? Object.fromEntries(headers.entries()) : { ...headers } : {};
  }
  function isFormData(value) {
    return typeof FormData < "u" && value instanceof FormData;
  }
  function isUrlSearchParams(value) {
    return typeof URLSearchParams < "u" && value instanceof URLSearchParams;
  }
  function hasFormToken(body) {
    return isFormData(body) || isUrlSearchParams(body) ? body.has("_csrf") && !!body.get("_csrf") : body && typeof body == "object" && !Array.isArray(body) ? body._csrf != null && String(body._csrf) !== "" : typeof body == "string" ? /(?:^|&)\s*_csrf=/.test(body) : !1;
  }
  function addCsrf(body, token, headers) {
    if (hasFormToken(body)) return body;
    if (isFormData(body)) {
      let next = new FormData();
      for (let [key, value] of body.entries()) next.append(key, value);
      return next.append("_csrf", token), next;
    }
    if (isUrlSearchParams(body)) {
      let next = new URLSearchParams(body);
      return next.set("_csrf", token), next;
    }
    if (body == null) return { _csrf: token };
    if (typeof body == "object" && !Array.isArray(body)) return { ...body, _csrf: token };
    if (String(headers?.["content-type"] || headers?.["Content-Type"] || "").toLowerCase().includes("application/x-www-form-urlencoded") || typeof body == "string") {
      let next = new URLSearchParams(String(body));
      return next.set("_csrf", token), next;
    }
    throw errorWith("csrf.body-unsupported", "当前请求正文不支持安全的 CSRF 注入");
  }
  function normalizeRepresentations(value) {
    let input = value == null ? ["text"] : Array.isArray(value) ? value : [value];
    return new Set(input.map((item) => String(item)).filter((item) => ["text", "json", "document"].includes(item)));
  }
  function normalizeResponse(response, requested, requestUrl) {
    let status = Number(response?.status), rawText = typeof response?.text == "string" ? response.text : "", output = {
      ok: response?.ok == null ? status >= 200 && status < 300 : !!response.ok,
      status: Number.isFinite(status) ? status : 0,
      headers: sanitizeDiagnostic(headersObject(response?.headers))
    };
    try {
      let requestedUrl = new URL(requestUrl), finalUrl = new URL(String(response?.url || requestedUrl.href), requestedUrl.href);
      ["http:", "https:"].includes(finalUrl.protocol) && !finalUrl.username && !finalUrl.password && finalUrl.origin === requestedUrl.origin && finalUrl.href !== requestedUrl.href && (output.finalUrl = finalUrl.href);
    } catch {
    }
    if (requested.has("text") && (output.text = rawText), requested.has("json"))
      if (response && Object.prototype.hasOwnProperty.call(response, "json")) output.json = response.json;
      else
        try {
          output.json = JSON.parse(rawText);
        } catch {
          output.json = null;
        }
    if (requested.has("document"))
      try {
        let Parser = typeof DOMParser < "u" ? DOMParser : null;
        output.document = Parser ? new Parser().parseFromString(rawText, "text/html") : null;
      } catch {
        output.document = null;
      }
    return output;
  }
  var RequestBroker = class {
    constructor({ transport, snapshot: snapshot2 = () => ({}), origin, rate = 0, timeout = 2e4, trace = () => {
    }, clock = () => Date.now() } = {}) {
      if (!transport) throw new TypeError("RequestBroker 需要 transport");
      this.transport = transport, this.snapshot = snapshot2, this.origin = nowOrigin(origin), this.rate = Math.max(0, Number(rate) || 0), this.timeout = Math.max(1, Number(timeout) || 2e4), this.trace = typeof trace == "function" ? trace : () => {
      }, this.clock = typeof clock == "function" ? clock : () => Date.now(), this._queue = Promise.resolve(), this._last = 0;
    }
    _emit(event) {
      try {
        this.trace(sanitizeDiagnostic(event));
      } catch {
      }
    }
    _context(owner) {
      return owner?.require ? owner : owner?.context?.require ? owner.context : null;
    }
    _require(owner, capability, purpose) {
      let context = this._context(owner);
      if (!context)
        throw errorWith(
          "capability.denied",
          "调用方没有能力上下文",
          { owner: String(owner || "unknown"), capability, purpose: String(purpose || "") }
        );
      return context.require(capability, purpose), context;
    }
    _routeCheck(intent, snapshot2) {
      if (intent.routeScope == null) return;
      let expected = typeof intent.routeScope == "object" ? intent.routeScope.fingerprint ?? intent.routeScope.routeFingerprint ?? intent.routeScope.route : intent.routeScope, current = routeFingerprint(snapshot2);
      if (String(expected ?? "") !== String(current ?? ""))
        throw errorWith("route.scope-mismatch", "请求目标已离开原路由", { expected: String(expected ?? ""), current: String(current ?? "") });
    }
    _csrf(snapshot2, body) {
      if (hasFormToken(body)) return null;
      let token = snapshot2?.csrf?.token ?? snapshot2?.csrf;
      return token == null || String(token) === "" ? null : String(token);
    }
    _enqueue(task, signal) {
      if (!this.rate) return task();
      let run = this._queue.then(async () => {
        if (signal?.aborted) throw errorWith("request.aborted", "请求已取消");
        let wait = this.rate - (this.clock() - this._last);
        if (wait > 0 && await new Promise((resolve, reject) => {
          let settled = !1, finish = (fn, value) => {
            settled || (settled = !0, clearTimeout(timer), signal?.removeEventListener("abort", stop), fn(value));
          }, timer = setTimeout(() => finish(resolve), wait), stop = () => finish(reject, errorWith("request.aborted", "请求已取消"));
          signal?.addEventListener("abort", stop, { once: !0 });
        }), signal?.aborted) throw errorWith("request.aborted", "请求已取消");
        return this._last = this.clock(), task();
      });
      return this._queue = run.then(() => {
      }, () => {
      }), run;
    }
    async _transport(url, options) {
      if (typeof this.transport == "function") return this.transport(url, options);
      if (typeof this.transport.raw == "function") return this.transport.raw(url, options);
      if (typeof this.transport.request == "function") return this.transport.request({ url, ...options });
      throw new TypeError("RequestBroker transport 不支持 raw/request");
    }
    async request(intent = {}) {
      let method = String(intent.method || "GET").toUpperCase();
      if (!METHODS.has(method)) throw errorWith("request.invalid-method", `不支持的请求方法 ${method}`);
      let rawPath = String(intent.path ?? ""), url;
      try {
        if (url = new URL(rawPath, this.origin), !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) throw new Error("invalid");
      } catch {
        throw errorWith("request.invalid-url", "请求 URL 无效");
      }
      let sameOrigin = url.origin === this.origin, external = !sameOrigin;
      if (!sameOrigin && !intent.external) throw errorWith("request.cross-origin", "跨域请求必须显式 external:true");
      let snapshot2 = snapshotValue(this.snapshot);
      this._routeCheck(intent, snapshot2);
      let purpose = String(intent.purpose || "网络请求").slice(0, 120), context = this._require(intent.owner || intent.context, external ? "net" : IDEMPOTENT.has(method) ? "read" : "write", purpose), signal = intent.signal || context.signal;
      if (signal?.aborted) throw errorWith("request.aborted", "请求已取消");
      let headers = { ...intent.headers || {} }, body = intent.body;
      if (!external && !IDEMPOTENT.has(method) && intent.csrfMode !== "none") {
        let token = this._csrf(snapshot2, body);
        if (!hasFormToken(body)) {
          if (!token) throw errorWith("csrf.missing", "当前页面没有可用 CSRF token");
          body = addCsrf(body, token, headers);
        }
      }
      let timeout = Math.max(1, Number(intent.timeout ?? this.timeout) || this.timeout), controller = new AbortController(), relay = () => controller.abort();
      signal?.addEventListener("abort", relay, { once: !0 });
      let timedOut = !1, timer = setTimeout(() => {
        timedOut = !0, controller.abort();
      }, timeout), transportOptions = {
        method,
        body,
        headers,
        external,
        signal: controller.signal,
        timeout,
        retry: intent.retryPolicy?.retries ?? intent.retry ?? (IDEMPOTENT.has(method) ? 2 : 0),
        backoff: intent.backoff,
        queue: intent.queue,
        onChunk: intent.onChunk
      }, safePath = `${url.pathname}`;
      this._emit({ kind: "request.start", owner: context.owner, purpose, method, path: safePath });
      try {
        let result = await this._enqueue(async () => {
          let call;
          try {
            call = Promise.resolve(this._transport(url.href, transportOptions));
          } catch (error) {
            call = Promise.reject(error);
          }
          let abort = new Promise((_, reject) => {
            let stop = () => reject(timedOut ? errorWith("request.timeout", "请求超时") : errorWith("request.aborted", "请求已取消"));
            controller.signal.addEventListener("abort", stop, { once: !0 }), call.finally(() => controller.signal.removeEventListener("abort", stop)).catch(() => {
            });
          });
          return Promise.race([call, abort]);
        }, signal), envelope = normalizeResponse(result, normalizeRepresentations(intent.response ?? intent.representations), url.href);
        return this._emit({ kind: "request.finish", owner: context.owner, purpose, method, path: safePath, status: envelope.status, ok: envelope.ok }), envelope;
      } catch (cause) {
        let code = timedOut ? "request.timeout" : signal?.aborted || cause?.code === "request.aborted" ? "request.aborted" : cause?.code || "request.failed", safeCause = sanitizeDiagnostic(cause), fallback = code === "request.timeout" ? "请求超时" : code === "request.aborted" ? "请求已取消" : "请求失败", message = typeof safeCause?.message == "string" && safeCause.message ? safeCause.message : fallback, error = errorWith(code, message);
        throw this._emit({ kind: "request.error", owner: context.owner, purpose, method, path: safePath, code }), error;
      } finally {
        clearTimeout(timer), signal?.removeEventListener("abort", relay);
      }
    }
  };

  // src/runtime/action-broker.js
  function actionError(code, message, fields = {}) {
    let error = new Error(message || code);
    return error.code = code, Object.assign(error, fields), error;
  }
  function contextOf(owner) {
    return owner?.require ? owner : owner?.context?.require ? owner.context : null;
  }
  function assertSerializable(value, seen = /* @__PURE__ */ new WeakSet()) {
    if (!(value == null || typeof value == "string" || typeof value == "number" || typeof value == "boolean")) {
      if (typeof value == "bigint" || typeof value == "function" || typeof value == "symbol" || value instanceof WeakMap || value instanceof WeakSet)
        throw actionError("action.args-invalid", "动作参数不可序列化");
      if (typeof value == "object") {
        if (seen.has(value)) throw actionError("action.args-invalid", "动作参数不能包含循环引用");
        if (seen.add(value), Array.isArray(value)) for (let item of value) assertSerializable(item, seen);
        else for (let [key, item] of Object.entries(value)) {
          if (!/^[\w.-]{1,80}$/.test(key)) throw actionError("action.args-invalid", "动作参数字段名不合法");
          assertSerializable(item, seen);
        }
        seen.delete(value);
      }
    }
  }
  function copy(value) {
    try {
      return structuredClone(value);
    } catch {
      return JSON.parse(JSON.stringify(value));
    }
  }
  function randomPart() {
    try {
      return crypto.randomUUID();
    } catch {
      return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
  }
  function getAction(actions, id) {
    return actions instanceof Map ? actions.get(id) : actions && typeof actions == "object" ? actions[id] : null;
  }
  function validateSchema(schema, args) {
    if (!schema) return !0;
    if (typeof schema == "function") return schema(args) !== !1;
    if (typeof schema.validate == "function") return schema.validate(args) !== !1;
    if (schema.type && schema.type !== "object") return !1;
    if (schema.required && Array.isArray(schema.required)) {
      for (let key of schema.required) if (args?.[key] == null || args[key] === "") return !1;
    }
    if (schema.properties && args && typeof args == "object") {
      for (let [key, rule] of Object.entries(schema.properties))
        if (!(args[key] == null || !rule) && (rule.type === "string" && typeof args[key] != "string" || rule.type === "number" && (typeof args[key] != "number" || !Number.isFinite(args[key])) || rule.enum && !rule.enum.includes(args[key])))
          return !1;
    }
    return !0;
  }
  function targetAllowed(provider, targetScope, allowlist) {
    let rule = provider?.targetScope ?? allowlist;
    return rule ? typeof rule == "function" ? rule(targetScope) !== !1 : Array.isArray(rule) ? rule.some((item) => JSON.stringify(item) === JSON.stringify(targetScope)) : typeof rule == "object" && targetScope && typeof targetScope == "object" ? Object.entries(rule).every(([key, value]) => targetScope[key] === value) : !1 : !0;
  }
  function classifyExecution(result) {
    if (result && ["success", "failure", "unknown"].includes(result.kind)) return result.kind;
    let status = Number(result?.status);
    if (Number.isFinite(status) && status >= 500) return "unknown";
    if (Number.isFinite(status) && (status < 200 || status >= 300)) return "failure";
    let json = result?.json ?? result?.data;
    return json && (json.ok === !1 || json.ok === 0 || json.ok === "0") ? "failure" : json && (json.ok === !0 || json.ok === 1 || json.ok === "1") || result?.ok === !0 ? "success" : "unknown";
  }
  function classifyCheck(result) {
    return result && ["confirmed", "not-confirmed", "unknown"].includes(result.kind) ? result.kind : result?.ok === !0 ? "confirmed" : result?.ok === !1 ? "not-confirmed" : "unknown";
  }
  var ActionBroker = class {
    constructor({ actions = /* @__PURE__ */ new Map(), providers, snapshot: snapshot2 = () => ({}), request = null, trace = () => {
    }, scopeTtlMs = 6e4, clock = () => Date.now(), targetAllowlist = null, maxRecords = 256 } = {}) {
      this.actions = providers || actions, this.snapshot = snapshot2, this.request = request, this.trace = typeof trace == "function" ? trace : () => {
      }, this.scopeTtlMs = Math.max(1, Number(scopeTtlMs) || 6e4), this.clock = typeof clock == "function" ? clock : () => Date.now();
      let limit = Number(maxRecords);
      this.maxRecords = Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : 256, this.targetAllowlist = targetAllowlist, this._counter = 0, this._pending = /* @__PURE__ */ new Map(), this._confirmed = /* @__PURE__ */ new WeakMap(), this._idempotency = /* @__PURE__ */ new Map();
    }
    register(actionId, provider) {
      let id = String(actionId || "");
      if (!id || !provider || typeof provider.execute != "function") throw actionError("action.invalid-provider", "动作提供方无效");
      if (!(this.actions instanceof Map)) throw actionError("action.registry-immutable", "当前动作目录不可注册");
      if (this.actions.has(id)) throw actionError("action.duplicate", "动作已注册");
      return this.actions.set(id, provider), () => {
        this.actions.get(id) === provider && this.actions.delete(id);
      };
    }
    _emit(event) {
      try {
        this.trace(sanitizeDiagnostic(event));
      } catch {
      }
    }
    _retireRecord(record) {
      record && (this._pending.delete(record.nonce), this._idempotency.delete(record.idempotencyKey), record.owner = null, record.provider = null, record.targetScope = null, record.args = null);
    }
    _pruneRecords(now = this.clock()) {
      for (let record of this._idempotency.values())
        now >= record.expiresAt && this._retireRecord(record);
      for (; this._idempotency.size > this.maxRecords; )
        this._retireRecord(this._idempotency.values().next().value);
    }
    _getRecord(pendingOrConfirmed) {
      return !pendingOrConfirmed || typeof pendingOrConfirmed != "object" ? null : pendingOrConfirmed.__actionBroker === this ? pendingOrConfirmed : this._pending.get(pendingOrConfirmed.nonce) || this._idempotency.get(pendingOrConfirmed.idempotencyKey) || null;
    }
    _routeCheck(record, phase) {
      let current = routeFingerprint(snapshotValue(this.snapshot));
      if (String(current ?? "") !== String(record.routeFingerprint ?? ""))
        throw actionError("action.route-mismatch", `动作在 ${phase} 阶段离开了原路由`);
    }
    _targetCheck(record) {
      if (!targetAllowed(record.provider, record.targetScope, this.targetAllowlist)) throw actionError("action.target-denied", "动作目标不在本地允许范围");
    }
    prepare({ owner, actionId, summary = "", targetScope = null, routeFingerprint: requestedRoute, args = {}, schema } = {}) {
      this._pruneRecords();
      let id = String(actionId || ""), provider = getAction(this.actions, id);
      if (!provider || typeof provider.execute != "function") throw actionError("action.unknown", "动作不存在");
      assertSerializable(args);
      let checked = schema || provider.schema;
      if (!validateSchema(checked, args)) throw actionError("action.schema-invalid", "动作参数不符合 schema");
      let snapshot2 = snapshotValue(this.snapshot), currentRoute = routeFingerprint(snapshot2);
      if (requestedRoute != null && String(requestedRoute) !== String(currentRoute ?? "")) throw actionError("action.route-mismatch", "动作目标已离开原路由");
      if (!targetAllowed(provider, targetScope, this.targetAllowlist)) throw actionError("action.target-denied", "动作目标不在本地允许范围");
      let createdAt = this.clock(), nonce = `scope-${++this._counter}-${randomPart()}`, idempotencyKey = `action-${id}-${this._counter}-${randomPart()}`, record = {
        __actionBroker: this,
        owner,
        provider,
        actionId: id,
        summary: String(summary || "").slice(0, 240),
        targetScope: copy(targetScope),
        routeFingerprint: currentRoute,
        args: copy(args),
        nonce,
        idempotencyKey,
        createdAt,
        expiresAt: createdAt + this.scopeTtlMs,
        nonceUsed: !1,
        confirmed: !1,
        executed: !1
      };
      return this._pending.set(nonce, record), this._idempotency.set(idempotencyKey, record), this._pruneRecords(createdAt), Object.freeze({
        actionId: id,
        summary: record.summary,
        targetScope: copy(record.targetScope),
        routeFingerprint: record.routeFingerprint,
        args: copy(record.args),
        nonce,
        idempotencyKey,
        createdAt,
        expiresAt: record.expiresAt
      });
    }
    async confirm(pending, { nonce, userConfirmed = !1 } = {}) {
      let record = this._pending.get(pending?.nonce);
      if (!record || record !== this._getRecord(pending)) throw actionError("action.pending-invalid", "动作 scope 无效");
      if (record.nonceUsed) throw actionError("action.nonce-used", "动作确认 nonce 已使用");
      if (String(nonce || "") !== record.nonce) throw actionError("action.nonce-invalid", "动作确认 nonce 无效");
      if (this.clock() > record.expiresAt)
        throw record.nonceUsed = !0, this._retireRecord(record), actionError("action.scope-expired", "动作确认 scope 已过期");
      if (!userConfirmed) throw actionError("action.confirmation-required", "动作需要用户明确确认");
      let context = contextOf(record.owner);
      if (!context) throw actionError("capability.denied", "动作没有能力上下文", { capability: "write" });
      context.require("write", `确认动作 ${record.actionId}`), this._routeCheck(record, "confirm"), this._targetCheck(record), record.nonceUsed = !0, record.confirmed = !0;
      let confirmedAt = this.clock();
      record.expiresAt = confirmedAt + this.scopeTtlMs;
      let confirmed = Object.freeze({
        actionId: record.actionId,
        summary: record.summary,
        targetScope: copy(record.targetScope),
        routeFingerprint: record.routeFingerprint,
        args: copy(record.args),
        nonce: record.nonce,
        idempotencyKey: record.idempotencyKey,
        confirmedAt
      });
      return this._confirmed.set(confirmed, record), this._emit({ kind: "confirm", owner: context.owner, actionId: record.actionId, idempotencyKey: record.idempotencyKey }), confirmed;
    }
    async execute(confirmed) {
      let record = this._confirmed.get(confirmed) || this._getRecord(confirmed);
      if (!record || !record.confirmed) throw actionError("action.confirmation-required", "动作尚未确认");
      if (record.executed) throw actionError("action.duplicate", "动作幂等键已执行");
      if (this.clock() > record.expiresAt)
        throw this._retireRecord(record), actionError("action.scope-expired", "动作执行 scope 已过期");
      if (this._idempotency.get(record.idempotencyKey) !== record) throw actionError("action.pending-invalid", "动作 scope 已失效");
      let context = contextOf(record.owner);
      if (!context) throw actionError("capability.denied", "动作没有能力上下文", { capability: "write" });
      context.require("write", `执行动作 ${record.actionId}`), this._routeCheck(record, "execute"), this._targetCheck(record), record.executed = !0;
      let meta = {
        actionId: record.actionId,
        idempotencyKey: record.idempotencyKey,
        targetScope: copy(record.targetScope),
        routeFingerprint: record.routeFingerprint,
        owner: context.owner,
        request: this.request,
        signal: context.signal
      }, result, thrown = null;
      try {
        result = await record.provider.execute(copy(record.args), meta);
      } catch (error) {
        thrown = error;
      }
      let kind;
      if (thrown) {
        let code = String(thrown.code || "");
        kind = /network|timeout|abort|unknown|fetch/i.test(code) ? "unknown" : "failure";
      } else kind = classifyExecution(result);
      let rawStatus = Number(result?.status), receipt = Object.freeze({
        actionId: record.actionId,
        idempotencyKey: record.idempotencyKey,
        owner: context.owner,
        targetScope: sanitizeDiagnostic(record.targetScope),
        routeFingerprint: record.routeFingerprint,
        status: Number.isFinite(rawStatus) ? rawStatus : 0,
        kind,
        at: this.clock()
      });
      return this._emit({ kind: "execute", owner: context.owner, actionId: record.actionId, idempotencyKey: record.idempotencyKey, outcome: kind }), this._pending.delete(record.nonce), record.args = null, record.expiresAt = this.clock() + this.scopeTtlMs, { kind, receipt };
    }
    async check(receipt) {
      this._pruneRecords();
      let record = this._idempotency.get(receipt?.idempotencyKey);
      if (!record || record.idempotencyKey !== receipt.idempotencyKey || !record.executed)
        throw actionError("action.receipt-invalid", "动作回执无效");
      let context = contextOf(record.owner);
      if (!context) throw actionError("capability.denied", "动作没有能力上下文", { capability: "read" });
      if (context.require("read", `只读检查动作 ${record.actionId}`), typeof record.provider.check != "function") throw actionError("action.check-unavailable", "动作没有只读结果检查器");
      let result;
      try {
        result = await record.provider.check({ ...receipt }, {
          actionId: record.actionId,
          targetScope: copy(record.targetScope),
          routeFingerprint: record.routeFingerprint,
          owner: context.owner,
          request: this.request,
          signal: context.signal,
          readOnly: !0
        });
      } catch {
        result = { kind: "unknown" };
      }
      let kind = classifyCheck(result);
      return this._emit({ kind: "check", owner: context.owner, actionId: record.actionId, idempotencyKey: record.idempotencyKey, outcome: kind }), kind !== "unknown" && this._retireRecord(record), { kind };
    }
    /**
     * 旧 facade 的兼容入口。旧插件已经在自己的 UI/确认层完成确认，
     * 因此这里只统一执行 write 能力、生命周期和安全 trace，再把现有
     * Actions 的语义结果原样返回；新代码必须使用 prepare/confirm/execute。
     */
    async legacy(owner, actionId, execute) {
      let context = contextOf(owner);
      if (!context) throw actionError("capability.denied", "动作没有能力上下文", { capability: "write" });
      if (context.require("write", `兼容动作 ${String(actionId || "")}`), typeof execute != "function") throw actionError("action.invalid-provider", "兼容动作没有执行器");
      return this._emit({ kind: "legacy-execute", owner: context.owner, actionId: String(actionId || "") }), execute();
    }
  };

  // src/ai/trace.js
  var TRACE_STAGES = Object.freeze(["plan", "scope", "read", "validate", "answer", "execute", "check", "limit"]), TRACE_STATES = Object.freeze(["pending", "active", "complete", "failed", "unknown", "skipped"]), TRACE_EVIDENCE = Object.freeze(["verified", "partial", "unverified"]), STAGE_SET = new Set(TRACE_STAGES), STATE_SET = new Set(TRACE_STATES), EVIDENCE_SET = new Set(TRACE_EVIDENCE);

  // src/store.js
  var PREFIX = "lsb_base";
  function gmAvailable() {
    return typeof GM_getValue == "function" && typeof GM_setValue == "function";
  }
  var Backend = class {
    constructor() {
      this._mem = /* @__PURE__ */ new Map(), this._lsRef = null;
    }
    /** 测试里每次换 JSDOM 会换 localStorage 实例，缓存必须跟着丢掉 */
    _syncCacheScope() {
      if (!gmAvailable())
        try {
          this._lsRef !== localStorage && (this._mem.clear(), this._lsRef = localStorage);
        } catch {
          this._mem.clear(), this._lsRef = null;
        }
    }
    get(key, def) {
      if (this._syncCacheScope(), gmAvailable()) {
        if (this._mem.has(key)) {
          let hit = this._mem.get(key);
          return hit.value === void 0 ? def : hit.value;
        }
        let v = GM_getValue(key, void 0);
        return v === void 0 ? def : (this._mem.set(key, { value: v }), v);
      }
      try {
        let raw = localStorage.getItem(key);
        if (raw === null)
          return this._mem.delete(key), def;
        let hit = this._mem.get(key);
        if (hit && hit.raw === raw) return hit.value;
        let v = JSON.parse(raw);
        return this._mem.set(key, { raw, value: v }), v;
      } catch {
        return def;
      }
    }
    set(key, value) {
      if (this._syncCacheScope(), gmAvailable())
        return this._mem.set(key, { value }), GM_setValue(key, value);
      try {
        let raw = JSON.stringify(value);
        localStorage.setItem(key, raw), this._mem.set(key, { raw, value });
      } catch (e) {
        console.warn("[LSB store] 写入失败", e);
      }
    }
    del(key) {
      if (this._syncCacheScope(), this._mem.delete(key), gmAvailable() && typeof GM_deleteValue == "function") return GM_deleteValue(key);
      try {
        localStorage.removeItem(key);
      } catch {
      }
    }
    keys() {
      if (gmAvailable() && typeof GM_listValues == "function") return GM_listValues();
      try {
        return Object.keys(localStorage);
      } catch {
        return [];
      }
    }
  }, backend = new Backend(), Store = class {
    constructor(ns) {
      this.ns = ns, this._prefix = `${PREFIX}:${ns}:`, this._watchers = /* @__PURE__ */ new Set();
    }
    _k(key) {
      return this._prefix + key;
    }
    get(key, def = null) {
      return backend.get(this._k(key), def);
    }
    set(key, value) {
      let old = backend.get(this._k(key), void 0);
      backend.set(this._k(key), value);
      for (let fn of this._watchers)
        try {
          fn(key, value, old);
        } catch (e) {
          console.error("[LSB store watcher]", e);
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
      let out = {};
      for (let k of this.keys()) out[k] = this.get(k);
      return out;
    }
    clear() {
      for (let k of this.keys()) this.del(k);
    }
    /** 本标签页内的变更通知（跨标签页请配合 GM_addValueChangeListener） */
    watch(fn) {
      return this._watchers.add(fn), () => this._watchers.delete(fn);
    }
    /**
     * 配置项：带默认值合并，插件升级新增字段时旧数据不会缺键。
     * defaults 为 schema：{ key: { type, default, label, desc, options? } }
     */
    config(defaults = {}) {
      let saved = this.get("__config", {}) || {}, out = {};
      for (let [k, def] of Object.entries(defaults)) {
        let spec = typeof def == "object" && def && "default" in def ? def : { default: def };
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
  var coreStore = new Store("__core"), RAW_PREFIX = PREFIX, rawKeys = () => backend.keys().filter((k) => k.startsWith(PREFIX)), rawGet = (k) => backend.get(k, void 0), rawSet = (k, v) => backend.set(k, v);

  // src/ui.js
  var MAX_SHELL_WINDOWS = 12, CSS = `
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
    let onWheel = (e) => {
      let dy = e.deltaY, scroller = e.target?.closest?.(".lsb-view, .lsb-tabs");
      if (scroller && root.contains(scroller)) {
        let top = scroller.scrollTop, max = scroller.scrollHeight - scroller.clientHeight;
        if (dy < 0 && top > 0 || dy > 0 && top < max - 0.5) return;
      }
      e.preventDefault();
    };
    root.addEventListener("wheel", onWheel, { passive: !1 });
  }
  var UI = class {
    constructor({ title = "LINUX.SB · 氢", version = "" } = {}) {
      this.title = title, this.version = version, this._tabs = [], this._shellAsideViews = [], this._shellAsideController = null, this._shellWindows = [], this._shellWindowController = null, this._shellScrollRootController = null, this._panel = null, this._active = null, this._styleDone = !1, this._toastHost = null, this._launcher = null;
    }
    injectStyle(css, id) {
      let key = id || uid("lsb-style");
      if (document.getElementById(key)) return;
      let el = document.createElement("style");
      el.id = key, el.textContent = css, document.head.appendChild(el);
    }
    ensureBase() {
      this._styleDone || (this.injectStyle(CSS, "lsb-base-style"), this._styleDone = !0);
    }
    /* ─────────── toast ─────────── */
    toast(message, { type = "info", title = "", timeout = 2600 } = {}) {
      this.ensureBase(), this._toastHost || (this._toastHost = document.createElement("div"), this._toastHost.className = "lsb-toast-host", document.body.appendChild(this._toastHost));
      let el = document.createElement("div");
      el.className = `lsb-toast${type === "error" ? " is-err" : type === "success" ? " is-ok" : ""}`, el.innerHTML = `${title ? `<div class="lsb-toast-title">${esc(title)}</div>` : ""}<div>${esc(message)}</div>`, this._toastHost.appendChild(el), requestAnimationFrame(() => el.classList.add("is-in"));
      let close = () => {
        el.classList.remove("is-in"), setTimeout(() => el.remove(), 200);
      };
      return timeout && setTimeout(close, timeout), el.addEventListener("click", close), close;
    }
    confirm(message, { title = "确认" } = {}) {
      return new Promise((resolve) => {
        this.ensureBase();
        let mask = document.createElement("div");
        mask.className = "lsb-mask";
        let box = document.createElement("div");
        box.className = "lsb-panel", box.style.width = "min(400px,92vw)", box.innerHTML = `
        <div class="lsb-panel-head"><strong>${esc(title)}</strong></div>
        <div class="lsb-view">${esc(message)}</div>
        <div class="lsb-actions">
          <button class="lsb-btn" data-no>取消</button>
          <button class="lsb-btn is-primary" data-yes>确定</button>
        </div>`;
        let done = (v) => {
          mask.remove(), box.remove(), resolve(v);
        };
        box.querySelector("[data-yes]").onclick = () => done(!0), box.querySelector("[data-no]").onclick = () => done(!1), mask.onclick = () => done(!1), document.body.append(mask, box);
      });
    }
    /* ─────────── 设置面板 ─────────── */
    /**
     * 注册一个面板分页。render(container, ctx) 由插件实现。
     * 返回注销函数。
     */
    registerTab({ id, name, order = 100, render }) {
      let tid = id || uid("tab"), tab = this._tabs.find((t) => t.id === tid);
      return tab ? (tab.name = name, tab.order = order, tab.render = render) : (tab = { id: tid, name, order, render }, this._tabs.push(tab)), this._tabs.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)), this._panel && this._renderTabs(), () => {
        this._tabs = this._tabs.filter((t) => t !== tab), this._panel && this._renderTabs();
      };
    }
    /** 返回当前已注册面板的只读目录，供安全动作枚举使用。 */
    panelCatalog() {
      return this._tabs.map((tab) => ({ id: String(tab.id), label: String(tab.name || tab.id) }));
    }
    /**
     * 注册一个氢壳右栏视图。skin 只消费这个通用协议，不感知视图业务。
     * 返回注销函数；插件停用时由 api.ui 自动清理。
     */
    registerShellAsideView({ id, label, order = 100, visible, render, windowId = "site" }) {
      if (!id || typeof render != "function") throw new Error("侧栏视图需要 id/render");
      let record = {
        id: String(id),
        label: String(label || id),
        order: Number.isFinite(Number(order)) ? Number(order) : 100,
        visible: typeof visible == "function" ? visible : () => !0,
        render,
        windowId: String(windowId || "site")
      }, old = this._shellAsideViews.find((item) => item.id === record.id);
      return old && (this._shellAsideViews = this._shellAsideViews.filter((item) => item !== old)), this._shellAsideViews.push(record), this._shellAsideViews.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label)), () => {
        this._shellAsideViews = this._shellAsideViews.filter((item) => item !== record);
      };
    }
    /** 返回当前上下文可见的氢壳右栏视图。 */
    shellAsideViews(context = {}) {
      return this._shellAsideViews.filter((item) => {
        try {
          return item.visible(context) !== !1;
        } catch {
          return !1;
        }
      });
    }
    /** 注册右栏 tab 的内部控制器；调用方只应是 skin。 */
    registerShellAsideController(fn) {
      if (typeof fn != "function") throw new Error("侧栏控制器需要函数");
      return this._shellAsideController = fn, () => {
        this._shellAsideController === fn && (this._shellAsideController = null);
      };
    }
    /** 受控切换右栏视图；未知 ID 始终安全回到站点视图。 */
    shellAsideSelect(id) {
      let wanted = String(id || ""), next = wanted === "site" || this._shellAsideViews.some((view) => view.id === wanted) ? wanted : "site";
      if (typeof this._shellAsideController != "function") return next;
      try {
        let selected = this._shellAsideController(next);
        return selected === "site" || this._shellAsideViews.some((view) => view.id === selected) ? String(selected) : next;
      } catch {
        return next;
      }
    }
    /**
     * 注册一个氢壳窗口。窗口本身由 skin 创建，插件只提供目录和内容描述。
     * 返回注销函数；插件停用时由 api.ui 自动清理。
     */
    registerShellWindow({ id, label, order = 100, visible, render, host, defaultRect, windowId } = {}) {
      let wid = String(id || "");
      if (!/^[a-z][a-z0-9-]{0,63}$/.test(wid)) throw new Error("氢壳窗口需要有效 id");
      if (typeof render != "function" && !host) throw new Error("氢壳窗口需要 render 或 host");
      let record = {
        id: wid,
        label: String(label || wid),
        order: Number.isFinite(Number(order)) ? Number(order) : 100,
        visible: typeof visible == "function" ? visible : () => !0,
        render: typeof render == "function" ? render : null,
        host: host || null,
        defaultRect: defaultRect && typeof defaultRect == "object" ? { ...defaultRect } : null,
        windowId: String(windowId || wid)
      }, old = this._shellWindows.find((item) => item.id === wid);
      if (old && (this._shellWindows = this._shellWindows.filter((item) => item !== old)), !old && this._shellWindows.length >= MAX_SHELL_WINDOWS) throw new Error("氢壳窗口数量超过上限");
      return this._shellWindows.push(record), this._shellWindows.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label)), () => {
        this._shellWindows = this._shellWindows.filter((item) => item !== record);
      };
    }
    /** 返回当前上下文可见的氢壳窗口目录。 */
    shellWindows(context = {}) {
      return this._shellWindows.filter((item) => {
        try {
          return item.visible(context) !== !1;
        } catch {
          return !1;
        }
      }).map((item) => ({ ...item, defaultRect: item.defaultRect ? { ...item.defaultRect } : null }));
    }
    /** 注册 skin 的窗口控制器；控制器接收 action/value。 */
    registerShellWindowController(fn) {
      if (typeof fn != "function") throw new Error("氢壳窗口控制器需要函数");
      return this._shellWindowController = fn, () => {
        this._shellWindowController === fn && (this._shellWindowController = null);
      };
    }
    _shellWindowCall(action, value) {
      if (typeof this._shellWindowController != "function") return null;
      try {
        return this._shellWindowController(action, value);
      } catch {
        return null;
      }
    }
    shellWindowFocus(id) {
      let result = this._shellWindowCall("focus", String(id || ""));
      return result == null ? "" : String(result);
    }
    shellWindowArrange() {
      return this._shellWindowCall("arrange");
    }
    shellWindowReset(id) {
      return this._shellWindowCall("reset", id == null ? "" : String(id));
    }
    shellWindowLayout() {
      return this._shellWindowCall("layout");
    }
    /** 注册 skin 的正文滚动根控制器。 */
    registerShellScrollRoot(fn) {
      if (typeof fn != "function") throw new Error("氢壳滚动根控制器需要函数");
      return this._shellScrollRootController = fn, () => {
        this._shellScrollRootController === fn && (this._shellScrollRootController = null);
      };
    }
    registerShellScrollRootController(fn) {
      return this.registerShellScrollRoot(fn);
    }
    shellScrollRoot() {
      if (typeof this._shellScrollRootController != "function") return null;
      try {
        return this._shellScrollRootController() || null;
      } catch {
        return null;
      }
    }
    /** 右下角圆形入口按钮 */
    mountLauncher() {
      if (this.ensureBase(), this._launcher) return;
      let btn = document.createElement("button");
      btn.className = "lsb-launcher", btn.type = "button", btn.title = this.title, btn.textContent = "H", btn.onclick = () => this.openPanel(), document.body.appendChild(btn), this._launcher = btn;
    }
    /**
     * 油猴图标菜单项。无 GM_registerMenuCommand 时静默跳过（测试 / 非 TM 环境）。
     * 返回注销函数。
     */
    menuCommand(title, fn) {
      let register = typeof GM_registerMenuCommand == "function" && GM_registerMenuCommand || typeof globalThis.GM_registerMenuCommand == "function" && globalThis.GM_registerMenuCommand;
      if (typeof register != "function") return () => {
      };
      let id = register(String(title), fn);
      return () => {
        let unreg = typeof GM_unregisterMenuCommand == "function" && GM_unregisterMenuCommand || typeof globalThis.GM_unregisterMenuCommand == "function" && globalThis.GM_unregisterMenuCommand;
        if (typeof unreg == "function" && id != null)
          try {
            unreg(id);
          } catch {
          }
      };
    }
    _mountPanel(title = this.title) {
      this.ensureBase();
      let mask = document.createElement("div");
      mask.className = "lsb-mask";
      let panel = document.createElement("div");
      panel.className = "lsb-panel lsb-panel-settings", panel.innerHTML = `
      <div class="lsb-panel-head">
        <strong>${esc(title)}</strong>
        <span class="lsb-ver">v${esc(this.version)}</span>
        <button class="lsb-panel-close" title="关闭">×</button>
      </div>
      <div class="lsb-panel-body">
        <div class="lsb-tabs"></div>
        <div class="lsb-view"></div>
      </div>`;
      let close = () => this.closePanel();
      panel.querySelector(".lsb-panel-close").onclick = close, mask.onclick = close;
      let onKey = (e) => {
        e.key === "Escape" && close();
      };
      document.addEventListener("keydown", onKey), this._panel = { mask, panel, onKey }, document.body.append(mask, panel), trapOverscroll(mask), trapOverscroll(panel);
    }
    openPanel(tabId) {
      if (this._panel) {
        tabId && this.showTab(tabId);
        return;
      }
      this._mountPanel(), this._renderTabs(), this.showTab(tabId || this._tabs[0]?.id);
    }
    /** 用专用表单视图打开设置，不经可能被插件功能页覆盖的分页 ID。 */
    openSettingsPanel({ id, name, render }) {
      if (!id || typeof render != "function") throw new Error("插件设置面板需要 id/render");
      this._panel && this.closePanel(), this._mountPanel(`${name || id} · 设置`), this._panel.panel.querySelector(".lsb-tabs").hidden = !0, this._active = `__settings__:${id}`, this._activeTab = null;
      let view = this._panel.panel.querySelector(".lsb-view"), heading = document.createElement("h2");
      heading.textContent = `${name || id} 设置`, heading.style.margin = "0 0 12px", view.appendChild(heading);
      try {
        render(view);
      } catch (e) {
        view.innerHTML = `<div class="lsb-empty">面板渲染失败：${esc(e.message)}</div>`, console.error("[LSB ui] settings render", e);
      }
    }
    closePanel() {
      this._panel && (document.removeEventListener("keydown", this._panel.onKey), this._panel.mask.remove(), this._panel.panel.remove(), this._panel = null, this._activeTab = null);
    }
    _renderTabs() {
      let host = this._panel?.panel.querySelector(".lsb-tabs");
      if (host) {
        host.innerHTML = "";
        for (let t of this._tabs) {
          let b = document.createElement("button");
          b.className = `lsb-tab${t === this._activeTab ? " is-active" : ""}`, b.type = "button", b.textContent = t.name, b.onclick = () => this.showTab(t), host.appendChild(b);
        }
      }
    }
    showTab(idOrTab) {
      let byObj = typeof idOrTab == "object" && idOrTab && this._tabs.includes(idOrTab), id = byObj ? idOrTab.id : idOrTab;
      if (!this._panel) return this.openPanel(id);
      let tab = byObj ? idOrTab : this._tabs.find((t) => t.id === id) || this._tabs[0], view = this._panel.panel.querySelector(".lsb-view");
      if (view.innerHTML = "", this._active = tab?.id || null, this._activeTab = tab || null, this._renderTabs(), !tab) {
        view.innerHTML = '<div class="lsb-empty">还没有插件注册设置页。</div>';
        return;
      }
      try {
        tab.render(view);
      } catch (e) {
        view.innerHTML = `<div class="lsb-empty">面板渲染失败：${esc(e.message)}</div>`, console.error("[LSB ui] tab render", e);
      }
    }
    /* ─────────── 表单构建（给插件写设置页省事） ─────────── */
    /**
     * 由 schema 生成表单，onSave 收到完整值对象。
     * schema: { key: { type:'text'|'password'|'number'|'switch'|'select'|'textarea', label, desc, default, options } }
     */
    buildForm(container, schema, values, onSave) {
      let form = document.createElement("div"), inputs = {};
      for (let [key, rawSpec] of Object.entries(schema || {})) {
        let spec = typeof rawSpec == "object" && rawSpec ? rawSpec : { default: rawSpec }, cur = values?.[key] ?? spec.default, label = document.createElement("label");
        label.className = "lsb-field";
        let span = document.createElement("span");
        span.textContent = spec.label || key, label.appendChild(span);
        let input;
        if (spec.type === "switch" || typeof cur == "boolean") {
          input = document.createElement("input"), input.type = "checkbox", input.checked = !!cur, label.style.display = "flex", label.style.alignItems = "center", label.style.gap = "8px", label.prepend(input), label.removeChild(span);
          let t = document.createElement("span");
          t.textContent = spec.label || key, t.style.margin = "0", label.appendChild(t);
        } else if (spec.type === "select") {
          input = document.createElement("select");
          for (let opt of spec.options || []) {
            let o = document.createElement("option");
            o.value = typeof opt == "object" ? opt.value : opt, o.textContent = typeof opt == "object" ? opt.label : opt, String(o.value) === String(cur) && (o.selected = !0), input.appendChild(o);
          }
          label.appendChild(input);
        } else spec.type === "textarea" ? (input = document.createElement("textarea"), input.rows = spec.rows || 4, input.value = cur ?? "", label.appendChild(input)) : (input = document.createElement("input"), input.type = spec.type === "number" ? "number" : spec.type === "password" ? "password" : "text", input.value = cur ?? "", label.appendChild(input));
        if (spec.desc) {
          let d = document.createElement("div");
          d.className = "lsb-row-desc", d.textContent = spec.desc, label.appendChild(d);
        }
        inputs[key] = { input, spec }, form.appendChild(label);
      }
      let bar = document.createElement("div");
      bar.style.display = "flex", bar.style.gap = "8px", bar.style.justifyContent = "flex-end";
      let save = document.createElement("button");
      return save.className = "lsb-btn is-primary", save.textContent = "保存", save.onclick = () => {
        let out = {};
        for (let [k, { input, spec }] of Object.entries(inputs))
          out[k] = input.type === "checkbox" ? input.checked : spec.type === "number" ? Number(input.value) : input.value;
        onSave(out), this.toast("已保存", { type: "success" });
      }, bar.appendChild(save), container.append(form, bar), inputs;
    }
    /* ─────────── 页面内挂点 ─────────── */
    /** 往某楼层的操作区加按钮（.post-ops 是站点自带的容器） */
    addPostAction(postEl, { label, title, onClick, icon = "" }) {
      let ops = postEl.querySelector(".post-ops");
      if (!ops) return null;
      let host = ops.querySelector(".lsb-ops");
      host || (host = document.createElement("span"), host.className = "lsb-ops", ops.appendChild(host));
      let btn = document.createElement("button");
      return btn.type = "button", btn.className = "lsb-op", btn.title = title || label, btn.innerHTML = `${icon}${esc(label)}`, btn.onclick = (e) => {
        e.preventDefault(), onClick(e);
      }, host.appendChild(btn), btn;
    }
    /** 往顶栏加一个链接/按钮 */
    addTopLink({ label, href = "#", onClick, title }) {
      let nav = document.querySelector(".themes-top-menu .forum-nav") || document.querySelector(".forum-nav");
      if (!nav) return null;
      let a = document.createElement("a");
      return a.className = "forum-link forum-enhancements-custom-top-link lsb-top-link", a.href = href, a.textContent = label, title && (a.title = title), onClick && (a.onclick = (e) => {
        e.preventDefault(), onClick(e);
      }), nav.appendChild(a), a;
    }
  };

  // src/dom.js
  var DomWatcher = class {
    constructor(bus) {
      this.bus = bus, this._observer = null, this._rules = [], this._scanCount = 0, this._notify = throttle(() => this.bus.emit("dom:changed", null, { source: "core" }), 120);
    }
    get scanCount() {
      return this._scanCount;
    }
    start(root = document.body) {
      this._observer || !root || (this._observer = new MutationObserver((records) => this._onMutations(records)), this._observer.observe(root, { childList: !0, subtree: !0 }), this._scan(root));
    }
    stop() {
      this._observer?.disconnect(), this._observer = null;
    }
    _onMutations(records) {
      let posts = /* @__PURE__ */ new Set(), items = /* @__PURE__ */ new Set(), added = [];
      for (let rec of records)
        for (let node of rec.addedNodes)
          if (node.nodeType === 1) {
            node.matches?.("li.post-entry") && !node.classList.contains("reply-pin-duplicate") ? posts.add(node) : node.matches?.("li.post-item") && !node.classList.contains("post-entry") && !node.classList.contains("topic-collections-collection-row") && items.add(node);
            for (let el of node.querySelectorAll?.("li.post-entry:not(.reply-pin-duplicate)") || []) posts.add(el);
            for (let el of node.querySelectorAll?.("li.post-item:not(.post-entry):not(.topic-collections-collection-row)") || [])
              items.add(el);
            added.push(node);
          }
      this._scanBatch(added), posts.size && this.bus.emit("dom:posts-added", [...posts], { raw: !0, source: "core" }), items.size && this.bus.emit("dom:list-added", [...items], { raw: !0, source: "core" }), records.length && this._notify();
    }
    /** 同批兄弟节点只扫父节点一次，避免无限滚动 20 条各扫一遍全部 onEach */
    _scanBatch(nodes) {
      if (!nodes.length) return;
      let byParent = /* @__PURE__ */ new Map(), orphans = [];
      for (let node of nodes) {
        let parent = node.parentNode;
        if (parent && parent.nodeType === 1) {
          let bucket = byParent.get(parent);
          bucket || (bucket = [], byParent.set(parent, bucket)), bucket.push(node);
        } else
          orphans.push(node);
      }
      for (let [parent, kids] of byParent)
        kids.length > 1 ? this._scan(parent) : this._scan(kids[0]);
      for (let node of orphans) this._scan(node);
    }
    /**
     * 对匹配 selector 的元素执行 fn，包含未来新增的。
     * fn 只会对同一元素执行一次。
     */
    onEach(selector, fn, { owner = "anonymous" } = {}) {
      let rule = { selector, fn, owner, seen: /* @__PURE__ */ new WeakSet() };
      return this._rules.push(rule), this._applyRule(rule, document), () => {
        this._rules = this._rules.filter((r) => r !== rule);
      };
    }
    offOwner(owner) {
      this._rules = this._rules.filter((r) => r.owner !== owner);
    }
    _scan(root) {
      this._scanCount++;
      for (let rule of this._rules) this._applyRule(rule, root);
    }
    _applyRule(rule, root) {
      let nodes = [];
      root.nodeType === 1 && root.matches?.(rule.selector) && nodes.push(root), root.querySelectorAll && nodes.push(...root.querySelectorAll(rule.selector));
      for (let el of nodes)
        if (!rule.seen.has(el)) {
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
      this.bus = bus, this.name = name, this.store = store, this.id = Math.random().toString(36).slice(2, 10), this._bc = null, this._unsub = null, this._seq = 0, this._start();
    }
    _start() {
      if (typeof BroadcastChannel == "function") {
        this._bc = new BroadcastChannel(this.name), this._bc.onmessage = (ev) => this._dispatch(ev.data);
        return;
      }
      if (typeof GM_addValueChangeListener == "function" && this.store) {
        let key = "__channel", listenKey = `lsb_base:__core:${key}`, id = GM_addValueChangeListener(listenKey, (_k, _old, val, remote) => {
          remote && this._dispatch(val);
        });
        this._unsub = () => {
          typeof GM_removeValueChangeListener == "function" && GM_removeValueChangeListener(id);
        }, this._fallbackKey = key;
      }
    }
    _dispatch(msg) {
      !msg || msg.from === this.id || !msg.plugin || this.bus.emit(`tab:${msg.plugin}:${msg.event}`, msg.payload, { source: `tab:${msg.from}` });
    }
    post({ plugin, event, payload }) {
      let msg = { plugin, event, payload, from: this.id, ts: Date.now(), seq: ++this._seq };
      if (this._bc) return this._bc.postMessage(msg);
      this._fallbackKey && this.store && this.store.set(this._fallbackKey, msg);
    }
    close() {
      this._bc?.close(), this._unsub?.();
    }
  };

  // src/election.js
  var Election = class {
    constructor(tabs, {
      onPromote,
      onDemote,
      jitter = 800,
      id = null,
      beatMs = 1e4,
      leaderTimeoutMs = 3e4
    } = {}) {
      this.tabs = tabs, this.onPromote = onPromote, this.onDemote = onDemote, this.jitter = Math.max(0, Number(jitter) || 0), this.beatMs = Math.max(200, Number(beatMs) || 1e4), this.leaderTimeoutMs = Math.max(this.beatMs * 2, Number(leaderTimeoutMs) || 3e4), this.id = id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, this.role = "pending", this.lastBeat = Date.now(), this.lastLeaderBeat = 0, this.leaderId = null, this._beatTimer = null, this._promoteTimer = null, this._offBeat = null, this._lastAnnounce = 0;
    }
    start() {
      this._offBeat = this.tabs.on("beat", (msg) => this._onBeat(msg)), this._beatTimer = setInterval(() => {
        this._announce(), this._maybeElect();
      }, this.beatMs), this._beatTimer?.unref?.(), this._announce(), this._scheduleElection();
    }
    /** id 较大者让位——确定性且无环，双方独立计算得到同一结论 */
    _yieldsTo(otherId) {
      return String(this.id) > String(otherId);
    }
    _onBeat(msg) {
      let from = msg && msg.id;
      if (!(!from || from === this.id)) {
        if (this.lastBeat = Date.now(), msg.role === "leader") {
          this.lastLeaderBeat = Date.now(), this.role === "leader" ? this._yieldsTo(from) ? (this.leaderId = from, this.demote()) : this._forceAnnounce() : (this.leaderId = from, this._cancelElection(), this.role === "pending" && this.demote());
          return;
        }
        this.role === "leader" && this._forceAnnounce();
      }
    }
    _announce() {
      let now = Date.now();
      now - this._lastAnnounce < 50 || (this._lastAnnounce = now, this.tabs.post("beat", { id: this.id, role: this.role }));
    }
    /** 状态刚变化时必须让对端知道，跳过节流 */
    _forceAnnounce() {
      this._lastAnnounce = 0, this._announce();
    }
    _maybeElect() {
      this.role !== "leader" && (Date.now() - this.lastLeaderBeat <= this.leaderTimeoutMs || this._scheduleElection());
    }
    /** 抖动后竞选；抖动让并发上位的概率变低，真撞上了由 id 仲裁兜底 */
    _scheduleElection() {
      this._promoteTimer || (this._promoteTimer = setTimeout(
        () => {
          this._promoteTimer = null, this.role !== "leader" && (Date.now() - this.lastLeaderBeat <= this.leaderTimeoutMs || this.promote());
        },
        this.jitter ? Math.random() * this.jitter : 0
      ), this._promoteTimer?.unref?.());
    }
    _cancelElection() {
      this._promoteTimer && (clearTimeout(this._promoteTimer), this._promoteTimer = null);
    }
    promote() {
      if (this.role !== "leader") {
        this.role = "leader", this.leaderId = this.id, this._forceAnnounce();
        try {
          this.onPromote?.();
        } catch (e) {
          console.error("[LSB election] onPromote", e);
        }
      }
    }
    demote() {
      if (this.role !== "follower") {
        this.role = "follower", this._forceAnnounce();
        try {
          this.onDemote?.();
        } catch (e) {
          console.error("[LSB election] onDemote", e);
        }
      }
    }
    stop() {
      clearInterval(this._beatTimer), this._beatTimer = null, this._cancelElection(), this._offBeat?.(), this._offBeat = null;
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

  // src/core/core-version.js
  var VERSION = "2.4.1";

  // src/core/permissions.js
  var PERMISSIONS = {
    read: "读取页面结构与站内 GET 请求",
    write: "代表当前用户发起写操作（回复/点赞/收藏等）",
    storage: "持久化自己的数据",
    ui: "注册面板、注入界面元素",
    net: "访问站外域名（需脚本自身 @connect）",
    admin: "全库数据导出/导入（数据主权，仅迁移类工具应申请）",
    events: "订阅与广播事件"
  }, DEFAULT_PERMISSIONS = ["read", "storage", "ui", "events"], IDEMPOTENT_METHODS = /* @__PURE__ */ new Set(["GET", "HEAD", "OPTIONS"]);
  function isIdempotent(method) {
    return IDEMPOTENT_METHODS.has(String(method || "GET").toUpperCase());
  }

  // src/shell/layout.js
  var DEFAULT_MIN = Object.freeze({ width: 240, height: 160 }), WORKSPACE_MARGIN = 12, WORKSPACE_GAP = 12, FREE_DRAG_SPACE = 96;
  function finite(value, fallback = 0) {
    let n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  function positive(value, fallback) {
    let n = finite(value, fallback);
    return n > 0 ? n : fallback;
  }
  function integer(value, fallback = 0) {
    return Math.round(finite(value, fallback));
  }
  function clamp(value, low, high) {
    return Math.min(Math.max(value, low), Math.max(low, high));
  }
  function copy2(value) {
    if (value === null || typeof value != "object") return value;
    if (Array.isArray(value)) return value.map(copy2);
    let out = {};
    for (let [key, item] of Object.entries(value)) out[key] = copy2(item);
    return out;
  }
  function validId(id) {
    return /^[a-z][a-z0-9-]{0,63}$/.test(String(id || ""));
  }
  function normalizeViewport(viewport = {}) {
    return {
      width: Math.max(1, integer(viewport.width, 1)),
      height: Math.max(1, integer(viewport.height, 1))
    };
  }
  function normalizeMin(item = {}) {
    let source = item.min || item.defaultRect || {};
    return {
      width: Math.max(1, integer(source.width, DEFAULT_MIN.width)),
      height: Math.max(1, integer(source.height, DEFAULT_MIN.height))
    };
  }
  function normalizeRegistry(registry = []) {
    let seen = /* @__PURE__ */ new Set();
    return (Array.isArray(registry) ? registry : []).map((item, index) => {
      let id = String(item?.id || "");
      if (!validId(id) || seen.has(id)) return null;
      seen.add(id);
      let defaultRect = item?.defaultRect || {};
      return {
        ...item,
        id,
        order: finite(item?.order, index),
        min: normalizeMin(item),
        defaultRect: {
          x: finite(defaultRect.x, 0),
          y: finite(defaultRect.y, 0),
          width: positive(defaultRect.width, normalizeMin(item).width),
          height: positive(defaultRect.height, normalizeMin(item).height)
        }
      };
    }).filter(Boolean).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).slice(0, 12);
  }
  function boundsFor(viewport) {
    let size = normalizeViewport(viewport);
    return { x: 0, y: 0, width: size.width, height: size.height };
  }
  function preferredWindowHeight(item, bounds) {
    let min = normalizeMin(item).height, configured = positive(item?.defaultRect?.height, bounds.height), available = Math.max(min, bounds.height - WORKSPACE_MARGIN * 2 - FREE_DRAG_SPACE);
    return clamp(configured, min, available);
  }
  function rectFrom(raw, item, bounds) {
    let min = item?.min || DEFAULT_MIN, source = raw || item?.defaultRect || {}, width = clamp(
      integer(source.width, item?.defaultRect?.width || min.width),
      min.width,
      bounds.width
    ), height = clamp(
      integer(source.height, item?.defaultRect?.height || min.height),
      min.height,
      bounds.height
    );
    return {
      x: clamp(integer(source.x, item?.defaultRect?.x || 0), bounds.x, bounds.x + bounds.width - width),
      y: clamp(integer(source.y, item?.defaultRect?.y || 0), bounds.y, bounds.y + bounds.height - height),
      width,
      height
    };
  }
  function windowState(raw, item, bounds) {
    let source = raw && typeof raw == "object" ? raw : {};
    return {
      ...rectFrom(source, item, bounds),
      visible: source.visible !== !1,
      collapsed: source.collapsed === !0,
      overrides: source.overrides && typeof source.overrides == "object" ? copy2(source.overrides) : {}
    };
  }
  function widthBucket(width) {
    let n = finite(width);
    return n >= 1100 ? "wide" : n >= 700 ? "medium" : "narrow";
  }
  function layoutStorageKey(origin, bucket) {
    let safeBucket = bucket === "wide" || bucket === "medium" || bucket === "narrow" ? bucket : widthBucket(0);
    return `layout:v1:${encodeURIComponent(String(origin || ""))}:${safeBucket}`;
  }
  function arrangeRects(registry, viewport) {
    let bounds = boundsFor(viewport), visible = registry.filter((item) => item.visible !== !1), result = {};
    if (!visible.length) return result;
    let byId = new Map(visible.map((item) => [item.id, item])), nav = byId.get("nav"), content = byId.get("content"), site = byId.get("site"), fallback = visible.filter((item) => !["nav", "content", "site"].includes(item.id)), navWidth = nav ? clamp(integer(nav.defaultRect.width, 240), nav.min.width, bounds.width) : 0, siteWidth = site ? clamp(integer(site.defaultRect.width, 280), site.min.width, bounds.width) : 0, fullHeight = Math.max(1, bounds.height - WORKSPACE_MARGIN * 2), baseY = bounds.y + WORKSPACE_MARGIN, baseX = bounds.x + WORKSPACE_MARGIN, right = bounds.x + bounds.width - WORKSPACE_MARGIN;
    nav && (result.nav = {
      x: baseX,
      y: baseY,
      width: navWidth,
      height: preferredWindowHeight(nav, bounds)
    });
    let contentX = nav ? baseX + navWidth + WORKSPACE_GAP : baseX, siteX = site ? right - siteWidth : right, availableContentWidth = Math.max(
      content?.min.width || DEFAULT_MIN.width,
      site ? siteX - WORKSPACE_GAP - contentX : right - contentX
    );
    content && (result.content = {
      x: contentX,
      y: baseY,
      width: Math.min(availableContentWidth, Math.max(content.min.width, site ? siteX - WORKSPACE_GAP - contentX : availableContentWidth)),
      height: preferredWindowHeight(content, bounds)
    }), site && (result.site = {
      x: siteX,
      y: baseY,
      width: siteWidth,
      height: preferredWindowHeight(site, bounds)
    });
    let nextY = baseY + Math.min(fullHeight, 240) + WORKSPACE_GAP;
    for (let item of fallback) {
      let width = clamp(integer(item.defaultRect.width, Math.min(360, bounds.width - WORKSPACE_MARGIN * 2)), item.min.width, bounds.width), height = clamp(integer(item.defaultRect.height, 240), item.min.height, bounds.height), x = clamp(integer(item.defaultRect.x, baseX), bounds.x, bounds.x + bounds.width - width), y = clamp(integer(item.defaultRect.y, nextY), bounds.y, bounds.y + bounds.height - height);
      result[item.id] = { x, y, width, height }, nextY = y + height + WORKSPACE_GAP;
    }
    return result;
  }
  function defaultShellLayout({ width, height, registry = [] } = {}) {
    let viewport = normalizeViewport({ width, height }), normalized = normalizeRegistry(registry), rects = arrangeRects(normalized, viewport), windows = {};
    for (let item of normalized)
      item.visible === !1 || !rects[item.id] || (windows[item.id] = {
        ...rectFrom(rects[item.id], item, boundsFor(viewport)),
        visible: !0,
        collapsed: !1,
        overrides: {}
      });
    return {
      version: 1,
      viewport,
      windows,
      zOrder: Object.keys(windows),
      updatedAt: 0
    };
  }
  function sanitizeShellLayout(raw, { width, height, registry = [] } = {}) {
    let viewport = normalizeViewport({ width, height }), normalized = normalizeRegistry(registry), byId = new Map(normalized.map((item) => [item.id, item])), bounds = boundsFor(viewport), windows = {}, sourceWindows = raw && typeof raw.windows == "object" ? raw.windows : {};
    for (let [id, state] of Object.entries(sourceWindows)) {
      let item = byId.get(id);
      !item || item.visible === !1 || (windows[id] = windowState(state, item, bounds));
    }
    let zOrder = [];
    for (let id of Array.isArray(raw?.zOrder) ? raw.zOrder : [])
      Object.prototype.hasOwnProperty.call(windows, id) && !zOrder.includes(id) && zOrder.push(id);
    for (let id of Object.keys(windows)) !zOrder.includes(id) && windows[id].visible && zOrder.push(id);
    return {
      version: 1,
      viewport,
      windows,
      zOrder,
      updatedAt: finite(raw?.updatedAt, 0),
      ...raw?.compat && typeof raw.compat == "object" ? { compat: copy2(raw.compat) } : {}
    };
  }
  function arrangeShellWindows(layout, registry = [], viewport = {}) {
    let normalized = normalizeRegistry(registry), size = normalizeViewport(viewport), clean = sanitizeShellLayout(layout, { ...size, registry: normalized }), defaults = defaultShellLayout({ ...size, registry: normalized }), windows = {};
    for (let item of normalized) {
      let previous = clean.windows[item.id], fallback = defaults.windows[item.id];
      fallback && (windows[item.id] = {
        ...fallback,
        ...previous ? {
          visible: previous.visible,
          collapsed: previous.collapsed,
          overrides: copy2(previous.overrides)
        } : {}
      });
    }
    return {
      ...defaults,
      windows,
      zOrder: Object.keys(windows),
      updatedAt: clean.updatedAt
    };
  }
  function snapValue(value, grid) {
    return Math.round(value / grid) * grid;
  }
  function candidatesFor(value, candidates, threshold) {
    let best = value, distance = threshold + 1;
    for (let candidate of candidates) {
      let d = Math.abs(candidate - value);
      d <= threshold && d < distance && (best = candidate, distance = d);
    }
    return best;
  }
  function snapRect(rect, { bounds, others = [], grid = 12, threshold = 12, min = DEFAULT_MIN } = {}) {
    let safeBounds = {
      x: finite(bounds?.x, 0),
      y: finite(bounds?.y, 0),
      width: Math.max(1, finite(bounds?.width, 1)),
      height: Math.max(1, finite(bounds?.height, 1))
    }, width = clamp(integer(rect?.width, min.width), Math.max(1, integer(min.width, DEFAULT_MIN.width)), safeBounds.width), height = clamp(integer(rect?.height, min.height), Math.max(1, integer(min.height, DEFAULT_MIN.height)), safeBounds.height), rawX = snapValue(finite(rect?.x, safeBounds.x), grid), rawY = snapValue(finite(rect?.y, safeBounds.y), grid), xCandidates = [
      safeBounds.x,
      safeBounds.x + safeBounds.width - width
    ], yCandidates = [
      safeBounds.y,
      safeBounds.y + safeBounds.height - height
    ];
    for (let other of Array.isArray(others) ? others : [])
      !other || typeof other != "object" || (xCandidates.push(finite(other.x, 0) - width, finite(other.x, 0) + finite(other.width, 0)), yCandidates.push(finite(other.y, 0) - height, finite(other.y, 0) + finite(other.height, 0)));
    let snappedXCandidates = xCandidates.map((candidate) => snapValue(candidate, grid)), snappedYCandidates = yCandidates.map((candidate) => snapValue(candidate, grid)), x = clamp(candidatesFor(rawX, snappedXCandidates, threshold), safeBounds.x, safeBounds.x + safeBounds.width - width), y = clamp(candidatesFor(rawY, snappedYCandidates, threshold), safeBounds.y, safeBounds.y + safeBounds.height - height);
    return { x, y, width, height };
  }
  function migrateLegacyShellLayout({ viewport = {}, legacy = {}, registry = [] } = {}) {
    let size = normalizeViewport(viewport), normalized = normalizeRegistry(registry), initial = defaultShellLayout({ ...size, registry: normalized }), bounds = boundsFor(size), byId = new Map(normalized.map((item) => [item.id, item])), rail = Math.max(0, finite(legacy.rail, 240)), aside = Math.max(0, finite(legacy.aside, 280));
    if (byId.has("nav") && (initial.windows.nav = {
      ...initial.windows.nav,
      ...rectFrom({
        x: WORKSPACE_MARGIN,
        y: WORKSPACE_MARGIN,
        width: rail,
        height: preferredWindowHeight(byId.get("nav"), bounds)
      }, byId.get("nav"), bounds)
    }), byId.has("site") && (initial.windows.site = {
      ...initial.windows.site,
      ...rectFrom({
        x: bounds.width - aside - WORKSPACE_MARGIN,
        y: WORKSPACE_MARGIN,
        width: aside,
        height: preferredWindowHeight(byId.get("site"), bounds)
      }, byId.get("site"), bounds)
    }), byId.has("content")) {
      let left = initial.windows.nav?.x + initial.windows.nav?.width + WORKSPACE_GAP || WORKSPACE_MARGIN, right = initial.windows.site?.x - WORKSPACE_GAP || bounds.width - WORKSPACE_MARGIN;
      initial.windows.content = {
        ...initial.windows.content,
        ...rectFrom({
          x: left,
          y: WORKSPACE_MARGIN,
          width: Math.max(1, right - left),
          height: preferredWindowHeight(byId.get("content"), bounds)
        }, byId.get("content"), bounds)
      };
    }
    return initial.compat = {
      ...initial.compat || {},
      asideActiveId: validId(legacy.asideActiveId) ? String(legacy.asideActiveId) : "site"
    }, initial;
  }

  // src/shell/scroll.js
  function finite2(value, fallback = 0) {
    let n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  function readAxis(root, axis) {
    return root ? finite2(root[axis], 0) : 0;
  }
  function writeAxis(root, axis, value) {
    if (root)
      try {
        root[axis] = Math.max(0, finite2(value, 0));
      } catch {
      }
  }
  function dispatchScroll(windowRef) {
    try {
      let event = typeof windowRef.Event == "function" ? new windowRef.Event("scroll", { bubbles: !1, cancelable: !1 }) : { type: "scroll" };
      windowRef.dispatchEvent?.(event);
    } catch {
    }
  }
  function readShellScroll(root) {
    return {
      x: readAxis(root, "scrollLeft"),
      y: readAxis(root, "scrollTop")
    };
  }
  function writeShellScroll(root, x = 0, y = 0) {
    return writeAxis(root, "scrollLeft", x), writeAxis(root, "scrollTop", y), readShellScroll(root);
  }
  function installShellScrollBridge(options = {}) {
    let windowRef = options.win || options.windowRef || globalThis.window, root = options.root, shouldDispatch = options.dispatch !== !1;
    if (!windowRef || !root)
      return {
        root: root || null,
        read: () => readShellScroll(root),
        scrollTo: (x, y) => writeShellScroll(root, x, y),
        dispose: () => {
        },
        restore: () => {
        },
        getRoot: () => root || null,
        getTop: () => readAxis(root, "scrollTop"),
        patched: !1
      };
    let initialPosition = {
      x: finite2(windowRef.scrollX ?? windowRef.pageXOffset, 0),
      y: finite2(windowRef.scrollY ?? windowRef.pageYOffset, 0)
    }, carriedInitialPosition = !1;
    readAxis(root, "scrollLeft") === 0 && initialPosition.x > 0 && (writeAxis(root, "scrollLeft", initialPosition.x), carriedInitialPosition = !0), readAxis(root, "scrollTop") === 0 && initialPosition.y > 0 && (writeAxis(root, "scrollTop", initialPosition.y), carriedInitialPosition = !0);
    let originalScrollTo = windowRef.scrollTo, originalScrollBy = windowRef.scrollBy, originalX = Object.getOwnPropertyDescriptor(windowRef, "scrollX"), originalY = Object.getOwnPropertyDescriptor(windowRef, "scrollY"), disposed = !1, ownX = ((name, axis) => {
      try {
        return Object.defineProperty(windowRef, name, {
          configurable: !0,
          enumerable: originalX?.enumerable ?? !0,
          get: () => readAxis(root, axis)
        }), !0;
      } catch {
        return !1;
      }
    })("scrollX", "scrollLeft"), ownY = (() => {
      try {
        return Object.defineProperty(windowRef, "scrollY", {
          configurable: !0,
          enumerable: originalY?.enumerable ?? !0,
          get: () => readAxis(root, "scrollTop")
        }), !0;
      } catch {
        return !1;
      }
    })(), onRootScroll = () => {
      !disposed && shouldDispatch && dispatchScroll(windowRef);
    };
    root.addEventListener?.("scroll", onRootScroll);
    let scrollTo = (xOrOptions = 0, y = 0) => (disposed || (xOrOptions && typeof xOrOptions == "object" ? writeShellScroll(root, xOrOptions.left ?? xOrOptions.x ?? 0, xOrOptions.top ?? xOrOptions.y ?? 0) : writeShellScroll(root, xOrOptions, y), shouldDispatch && dispatchScroll(windowRef)), readShellScroll(root)), scrollBy = (xOrOptions = 0, y = 0) => {
      let current = readShellScroll(root);
      return xOrOptions && typeof xOrOptions == "object" ? scrollTo(current.x + finite2(xOrOptions.left ?? xOrOptions.x, 0), current.y + finite2(xOrOptions.top ?? xOrOptions.y, 0)) : scrollTo(current.x + finite2(xOrOptions, 0), current.y + finite2(y, 0));
    };
    try {
      windowRef.scrollTo = scrollTo;
    } catch {
    }
    try {
      windowRef.scrollBy = scrollBy;
    } catch {
    }
    return carriedInitialPosition && shouldDispatch && dispatchScroll(windowRef), {
      root,
      read: () => readShellScroll(root),
      getRoot: () => root,
      getTop: () => readAxis(root, "scrollTop"),
      scrollTo,
      scrollBy,
      patched: ownX || ownY,
      dispose() {
        if (!disposed) {
          disposed = !0, root.removeEventListener?.("scroll", onRootScroll);
          try {
            windowRef.scrollTo === scrollTo && (windowRef.scrollTo = originalScrollTo);
          } catch {
          }
          try {
            windowRef.scrollBy === scrollBy && (windowRef.scrollBy = originalScrollBy);
          } catch {
          }
          try {
            ownX && (originalX ? Object.defineProperty(windowRef, "scrollX", originalX) : delete windowRef.scrollX);
          } catch {
          }
          try {
            ownY && (originalY ? Object.defineProperty(windowRef, "scrollY", originalY) : delete windowRef.scrollY);
          } catch {
          }
        }
      },
      restore() {
        this.dispose();
      }
    };
  }

  // src/shell/style.js
  var COLOR_RE = /^(?:#[0-9a-f]{3,8}|(?:rgb|hsl)a?\(\s*[\d.%\s,+-]+\))$/i, FONT_RE = /^(?=[^;\r\n]*[\p{L}\p{N}])[\p{L}\p{N}\s"'_,.+-]{1,160}$/u, DENSITIES = /* @__PURE__ */ new Set(["舒适", "紧凑"]), TOKEN_SCHEMA = Object.freeze({
    baseFontSize: { css: "--lsb-shell-font-size", kind: "length", min: 12, max: 32 },
    fontFamily: { css: "--lsb-shell-font-family", kind: "font" },
    textColor: { css: "--lsb-shell-text", kind: "color" },
    panelColor: { css: "--lsb-shell-panel", kind: "color" },
    accentColor: { css: "--lsb-shell-accent", kind: "color" },
    glassOpacity: { css: "--lsb-shell-glass-opacity", kind: "number", min: 0.35, max: 1 },
    glassBlur: { css: "--lsb-shell-glass-blur", kind: "length", min: 0, max: 32 },
    density: { css: "--lsb-shell-density", kind: "density" }
  });
  function number(value) {
    let n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function clamp2(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
  function cleanString(value, max = 160) {
    let text4 = String(value ?? "").trim();
    return text4 && text4.length <= max ? text4 : null;
  }
  function sanitizeTokenValue(name, value) {
    let spec = TOKEN_SCHEMA[name];
    if (!spec || value == null || value === "") return null;
    if (spec.kind === "length") {
      let parsed = number(String(value).replace(/px$/i, ""));
      return parsed == null ? null : `${Math.round(clamp2(parsed, spec.min, spec.max) * 10) / 10}px`;
    }
    if (spec.kind === "number") {
      let parsed = number(value);
      return parsed == null ? null : String(Math.round(clamp2(parsed, spec.min, spec.max) * 100) / 100);
    }
    if (spec.kind === "color") {
      let text4 = cleanString(value, 80);
      return text4 && COLOR_RE.test(text4) ? text4 : null;
    }
    if (spec.kind === "font") {
      let text4 = cleanString(value);
      return text4 && FONT_RE.test(text4) && !/(?:url|expression|var\s*\()/i.test(text4) ? text4 : null;
    }
    if (spec.kind === "density") {
      let text4 = String(value);
      return DENSITIES.has(text4) ? text4 : null;
    }
    return null;
  }
  function mergeShellTokens(globalTokens = {}, overrides = {}) {
    let result = {};
    for (let name of Object.keys(TOKEN_SCHEMA)) {
      let local = sanitizeTokenValue(name, overrides?.[name]), global = sanitizeTokenValue(name, globalTokens?.[name]);
      result[name] = local ?? global ?? null;
    }
    return result;
  }
  function tokenCss(tokens = {}) {
    let declarations = [];
    for (let [name, spec] of Object.entries(TOKEN_SCHEMA)) {
      let value = sanitizeTokenValue(name, tokens?.[name]);
      value != null && declarations.push(`${spec.css}:${value}`);
    }
    return declarations.join(";");
  }
  function moduleInspectorModel(layout = {}, id = "") {
    let state = layout?.windows?.[id] && typeof layout.windows[id] == "object" ? layout.windows[id] : {}, overrides = state.overrides && typeof state.overrides == "object" ? state.overrides : {}, values = {}, inherited = {};
    for (let name of Object.keys(TOKEN_SCHEMA)) {
      let value = sanitizeTokenValue(name, overrides[name]);
      values[name] = value, inherited[name] = value == null;
    }
    return {
      id: String(id || ""),
      values,
      inherited,
      visible: state.visible !== !1,
      collapsed: state.collapsed === !0,
      rect: {
        x: Number(state.x) || 0,
        y: Number(state.y) || 0,
        width: Number(state.width) || 0,
        height: Number(state.height) || 0
      }
    };
  }

  // src/shell/media.js
  var MEDIA_DB_NAME = "lsb_skin_media";
  var memory = /* @__PURE__ */ new Map();
  function storeFor(kind) {
    return kind === "image" || kind === "images" ? "images" : kind === "font" || kind === "fonts" ? "fonts" : "videos";
  }
  function memoryKey(kind, key) {
    return `${storeFor(kind)}:${String(key || "")}`;
  }
  function isHttpsUrl(value) {
    try {
      return new URL(String(value || ""), "https://linux.sb/").protocol === "https:" && /^https:\/\//i.test(String(value || "").trim());
    } catch {
      return !1;
    }
  }
  function validateMediaFile(file, { kind = "video" } = {}) {
    let store = storeFor(kind), normalized = store === "fonts" ? "font" : store === "images" ? "image" : "video", size = Number(file?.size);
    if (!Number.isFinite(size) || size < 0) return { ok: !1, reason: "invalid-size" };
    let limit = normalized === "font" ? 10485760 : normalized === "image" ? 20971520 : 52428800;
    if (size > limit) return { ok: !1, reason: "too-large", limit };
    let type = String(file?.type || "").toLowerCase();
    return normalized === "video" && type && !type.startsWith("video/") ? { ok: !1, reason: "invalid-type" } : normalized === "image" && type && !type.startsWith("image/") ? { ok: !1, reason: "invalid-type" } : normalized === "font" && type && !(/^(?:font|application)\//.test(type) || /(?:woff2?|ttf|otf)/.test(type)) ? { ok: !1, reason: "invalid-type" } : { ok: !0, kind: normalized, limit };
  }
  function validateMediaDescriptor(kind, descriptor = {}) {
    let store = storeFor(kind), normalized = store === "fonts" ? "font" : store === "images" ? "image" : "video", item = descriptor && typeof descriptor == "object" ? descriptor : {}, source = String(item.source || item.url || "").trim();
    if (source)
      return isHttpsUrl(source) ? { ok: !0, kind: normalized, source } : { ok: !1, kind: normalized, reason: "https-required" };
    let size = Number(item.size), limit = normalized === "font" ? 10485760 : normalized === "image" ? 20971520 : 52428800;
    if (!Number.isFinite(size) || size < 0) return { ok: !1, kind: normalized, reason: "invalid-size", limit };
    if (size > limit) return { ok: !1, kind: normalized, reason: "too-large", limit };
    if (item.mime || item.type) {
      let type = String(item.mime || item.type).toLowerCase();
      if (!(normalized === "video" ? type.startsWith("video/") : normalized === "image" ? type.startsWith("image/") : /^(?:font|application)\//.test(type) || /(?:woff2?|ttf|otf)/.test(type))) return { ok: !1, kind: normalized, reason: "invalid-type", limit };
    }
    return { ok: !0, kind: normalized, size, limit };
  }
  function openMediaDb(indexedDBRef = globalThis.indexedDB, name = MEDIA_DB_NAME) {
    let memoryDb = () => ({ memory: !0, name });
    return indexedDBRef?.open ? new Promise((resolve, reject) => {
      let request;
      try {
        request = indexedDBRef.open(name, 2);
      } catch {
        resolve(memoryDb());
        return;
      }
      request.onupgradeneeded = () => {
        let db = request.result;
        for (let store of ["videos", "images", "fonts"])
          db.objectStoreNames.contains(store) || db.createObjectStore(store);
      }, request.onsuccess = () => resolve(request.result), request.onerror = () => resolve(memoryDb());
    }) : Promise.resolve(memoryDb());
  }
  function optionsFrom(first, second) {
    return first && typeof first == "object" && ("kind" in first || "key" in first || "value" in first) ? first : { ...second || {}, db: first };
  }
  async function readMedia(first, second) {
    let { db, kind = "video", key } = optionsFrom(first, second);
    return key ? !db || db.memory ? memory.get(memoryKey(kind, key)) ?? null : new Promise((resolve, reject) => {
      try {
        let request = db.transaction(storeFor(kind), "readonly").objectStore(storeFor(kind)).get(String(key));
        request.onsuccess = () => resolve(request.result ?? null), request.onerror = () => reject(request.error || new Error("media-read-failed"));
      } catch (error) {
        reject(error);
      }
    }) : null;
  }
  async function writeMedia(first, second) {
    let { db, kind = "video", key, value } = optionsFrom(first, second);
    if (!key) throw new Error("media-key-required");
    return !db || db.memory ? (memory.set(memoryKey(kind, key), value), value) : new Promise((resolve, reject) => {
      try {
        let request = db.transaction(storeFor(kind), "readwrite").objectStore(storeFor(kind)).put(value, String(key));
        request.onsuccess = () => resolve(value), request.onerror = () => reject(request.error || new Error("media-write-failed"));
      } catch (error) {
        reject(error);
      }
    });
  }
  async function clearMedia(first, second) {
    let { db, kind = "video", key } = optionsFrom(first, second);
    if (key) {
      if (!db || db.memory) {
        memory.delete(memoryKey(kind, key));
        return;
      }
      return new Promise((resolve, reject) => {
        try {
          let request = db.transaction(storeFor(kind), "readwrite").objectStore(storeFor(kind)).delete(String(key));
          request.onsuccess = () => resolve(), request.onerror = () => reject(request.error || new Error("media-clear-failed"));
        } catch (error) {
          reject(error);
        }
      });
    }
  }
  async function loadFontFace({ family, source, document: documentRef = globalThis.document, FontFaceCtor = globalThis.FontFace, URLCtor = globalThis.URL } = {}) {
    if (!family || !source || typeof FontFaceCtor != "function" || !documentRef?.fonts?.add)
      throw new Error("font-face-unavailable");
    let objectUrl = "", fontSource = source;
    if (typeof Blob < "u" && source instanceof Blob) {
      if (!URLCtor?.createObjectURL) throw new Error("font-object-url-unavailable");
      objectUrl = URLCtor.createObjectURL(source), fontSource = `url(${objectUrl})`;
    }
    try {
      let face = new FontFaceCtor(String(family), fontSource);
      return await face.load(), documentRef.fonts.add(face), face.dispose = () => {
        try {
          documentRef.fonts.delete?.(face);
        } catch {
        }
        objectUrl && URLCtor.revokeObjectURL?.(objectUrl);
      }, face;
    } catch (error) {
      throw objectUrl && URLCtor.revokeObjectURL?.(objectUrl), error;
    }
  }

  // src/core/api-factory.js
  function createPluginApi(rec, core) {
    let has = (p) => rec.permissions.includes(p), need = (p, what) => {
      if (rec.context) return rec.context.require(p, what);
      if (!has(p)) throw new Error(`插件 ${rec.id} 未声明 '${p}' 权限，无法 ${what}`);
    }, own = (fn) => (rec.disposers.push(fn), fn), requestOpts = (opts) => ({
      ...opts && typeof opts == "object" ? opts : {},
      signal: opts?.signal || rec.abortController?.signal
    }), store = makeStore(rec.id), brokerResponse = (path, envelope) => {
      let url = "";
      try {
        url = new URL(String(path), core.net.origin).href;
      } catch {
      }
      let { finalUrl, ...response } = envelope;
      return { ...response, ...finalUrl || url ? { url: finalUrl || url } : {} };
    }, brokerRaw = (path, opts = {}) => core.requestBroker.request({
      owner: rec.context,
      purpose: opts.purpose || `插件 ${rec.id} 网络请求`,
      path,
      ...opts,
      signal: opts.signal || rec.abortController?.signal,
      response: ["text"]
    }).then((envelope) => brokerResponse(path, envelope)), brokerDoc = async (path, opts = {}) => {
      let envelope = await core.requestBroker.request({
        owner: rec.context,
        purpose: opts.purpose || `插件 ${rec.id} 读取页面`,
        path,
        ...opts,
        signal: opts.signal || rec.abortController?.signal,
        response: ["text"]
      });
      if (!envelope.ok) throw new Error(`${String(path)} → HTTP ${envelope.status}`);
      let doc = new DOMParser().parseFromString(envelope.text || "", "text/html"), csrf = readCsrf(doc);
      return csrf && core.net.setCsrf(csrf), doc;
    }, brokerJson = async (path, opts = {}) => {
      let envelope = await core.requestBroker.request({
        owner: rec.context,
        purpose: opts.purpose || `插件 ${rec.id} 读取 JSON`,
        path,
        ...opts,
        signal: opts.signal || rec.abortController?.signal,
        response: ["json", "text"]
      });
      if (envelope.json === null && envelope.text && !/^\s*(?:null|false|0)\s*$/.test(envelope.text))
        try {
          return JSON.parse(envelope.text);
        } catch {
          throw new Error(`${String(path)} 返回非 JSON（HTTP ${envelope.status}）`);
        }
      return envelope.json;
    }, api = {
      base: { version: VERSION, id: rec.id, debug: core.debug },
      runtime: {
        context: () => rec.context?.summary() || { owner: rec.id, capabilities: Object.freeze([]) }
      },
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
      get signal() {
        return rec.abortController?.signal || null;
      },
      on(event, fn) {
        need("events", "订阅事件");
        let off = core.bus.on(event, fn, { owner: rec.id });
        return own(off), off;
      },
      once(event, fn) {
        need("events", "订阅事件");
        let off = core.bus.once(event, fn, { owner: rec.id });
        return own(off), off;
      },
      emit(event, payload, opts) {
        return need("events", "广播事件"), core.bus.emit(`plugin:${rec.id}:${event}`, payload, { ...opts, source: rec.id });
      },
      emitGlobal(event, payload, opts) {
        return need("events", "广播事件"), core.bus.emit(event, payload, { ...opts, source: rec.id });
      },
      handle(name, fn) {
        need("events", "注册 RPC");
        let off = core.bus.handle(name, fn, { owner: rec.id });
        return own(off), off;
      },
      request(name, payload, opts) {
        return need("events", "调用 RPC"), core.bus.request(name, payload, opts);
      },
      hasHandler: (name) => core.bus.hasHandler(name),
      plugin(id) {
        if (!(rec.requires.plugins || {})[id] && id !== rec.id)
          throw new Error(`插件 ${rec.id} 未在 requires.plugins 声明依赖 ${id}`);
        return core.plugins.get(id)?.exports ?? null;
      },
      store: {
        get: (k, d) => (need("storage", "读取存储"), store.get(k, d)),
        set: (k, v) => (need("storage", "写入存储"), store.set(k, v)),
        del: (k) => (need("storage", "删除存储"), store.del(k)),
        update: (k, fn, d) => (need("storage", "更新存储"), store.update(k, fn, d)),
        keys: () => (need("storage", "列出存储"), store.keys()),
        clear: () => (need("storage", "清空存储"), store.clear()),
        watch: (fn) => (need("storage", "监听存储"), own(store.watch(fn)))
      },
      config: () => (need("storage", "读取配置"), store.config(rec.configSchema || {})),
      saveConfig: (patch) => {
        need("storage", "保存配置");
        let v = store.saveConfig(patch);
        return core.bus.emit(`config:changed:${rec.id}`, v, { source: "core" }), v;
      },
      net: {
        doc: (path, opts) => (need("read", "发起站内请求"), brokerDoc(path, requestOpts(opts))),
        json: (path, opts) => (need("read", "发起站内请求"), brokerJson(path, requestOpts(opts))),
        search: (query, field, opts) => (need("read", "执行站内搜索"), core.net.search(query, field, requestOpts(opts))),
        classifyWrite: (response, opts) => (need("read", "解析站内写入响应"), core.net.classifyWrite(response, opts)),
        raw: (path, opts) => (opts?.external || !core.net.isSameOrigin(path) ? need("net", "访问站外域名") : isIdempotent(opts?.method) ? need("read", "发起站内请求") : need("write", `对站内发起 ${String(opts?.method || "GET").toUpperCase()} 请求`), brokerRaw(path, requestOpts(opts))),
        async *pages(pathFn, maxPage = 1, opts = {}) {
          need("read", "发起站内请求");
          let scopedOpts = requestOpts(opts);
          for (let p = 1; p <= maxPage; p++)
            throwIfAborted(scopedOpts.signal), yield { page: p, doc: await core.net.doc(typeof pathFn == "function" ? pathFn(p) : pathFn, scopedOpts) };
        }
      },
      actions: new Proxy(
        {},
        {
          get(_t, key) {
            return (...args) => {
              need("write", `执行写操作 ${String(key)}`);
              let fn = core.actions[key];
              if (typeof fn != "function") throw new Error(`未知动作 actions.${String(key)}`);
              return core.log("action", `${rec.id} → ${String(key)}`, args[0]), core.actionBroker.legacy(rec.context, key, () => fn.apply(core.actions, args));
            };
          }
        }
      ),
      parse: {
        list: parseList,
        listPages,
        listItem: parseListItem,
        topic: parseTopic,
        userReplies: parseUserReplies,
        post: parsePost,
        user: parseUser,
        notifications: parseNotifications,
        likeTargets: parseLikeTargets,
        topicFavoriteState: parseTopicFavoriteState,
        detectPage,
        snapshot
      },
      routes: ROUTES,
      sel: SEL,
      ui: {
        toast: (msg, opts) => (need("ui", "弹提示"), core.ui.toast(msg, opts)),
        confirm: (msg, opts) => (need("ui", "弹确认框"), core.ui.confirm(msg, opts)),
        style: (css) => (need("ui", "注入样式"), core.ui.injectStyle(css, `lsb-style-${rec.id}`)),
        showTab: (id) => {
          need("ui", "切换面板页"), core.ui.showTab(id);
        },
        buildForm: (host, schema, values, onSave) => (need("ui", "生成设置表单"), core.ui.buildForm(host, schema, values, onSave)),
        tab: (opt) => (need("ui", "注册设置页"), own(core.ui.registerTab({ id: opt.id || rec.id, name: opt.name || rec.name, order: opt.order, render: opt.render }))),
        openPanel: (id) => (need("ui", "打开面板"), core.ui.openPanel(id)),
        panels: () => (need("ui", "读取面板目录"), core.ui.panelCatalog()),
        settingsPlugins: () => (need("ui", "读取插件设置目录"), [...core.plugins.values()].filter((plugin) => !!plugin.configSchema).map((plugin) => ({ id: plugin.id, name: plugin.name, state: plugin.state }))),
        openPluginSettings: (id) => {
          need("ui", "打开插件设置");
          let pluginId = String(id || ""), plugin = core.plugins.get(pluginId);
          if (!plugin) throw new Error(`插件 ${pluginId || "(空)"} 不存在`);
          if (!plugin.configSchema) throw new Error(`插件 ${pluginId} 未声明配置项`);
          core.ui.openSettingsPanel({
            id: plugin.id,
            name: plugin.name,
            render: (host) => {
              typeof plugin.configTabRenderer == "function" ? plugin.configTabRenderer(host) : core._renderConfigForm(plugin, host);
            }
          });
        },
        menuCommand: (title, fn) => (need("ui", "注册油猴菜单"), core.ui.menuCommand(title, fn)),
        postAction: (postEl, opt) => (need("ui", "注入楼层按钮"), core.ui.addPostAction(postEl, opt)),
        topLink: (opt) => (need("ui", "注入顶栏"), core.ui.addTopLink(opt)),
        configTab: (opt = {}) => {
          need("ui", "注册设置页");
          let render = (host) => {
            if (!rec.configSchema) {
              host.innerHTML = '<div class="lsb-empty">该插件未声明配置项。</div>';
              return;
            }
            core.ui.buildForm(host, rec.configSchema, store.config(rec.configSchema), (v) => api.saveConfig(v)), opt.render && opt.render(host);
          };
          return rec.configSchema && (rec.configTabRenderer = render), core.ui.registerTab({
            id: opt.id || rec.id,
            name: opt.name || rec.name,
            order: opt.order,
            render
          });
        },
        shellAsideView: (opt) => (need("ui", "注册侧栏视图"), own(core.ui.registerShellAsideView(opt))),
        shellAsideViews: (context) => (need("ui", "读取侧栏视图"), core.ui.shellAsideViews(context)),
        shellAsideController: (fn) => (need("ui", "注册侧栏控制器"), own(core.ui.registerShellAsideController(fn))),
        shellAsideSelect: (id) => (need("ui", "切换侧栏视图"), core.ui.shellAsideSelect(id)),
        shellWindowRegister: (opt) => (need("ui", "注册氢壳窗口"), own(core.ui.registerShellWindow(opt))),
        shellWindows: (context) => (need("ui", "读取氢壳窗口"), core.ui.shellWindows(context)),
        shellWindowController: (fn) => (need("ui", "注册氢壳窗口控制器"), own(core.ui.registerShellWindowController(fn))),
        shellWindowFocus: (id) => (need("ui", "聚焦氢壳窗口"), core.ui.shellWindowFocus(id)),
        shellWindowArrange: () => (need("ui", "整理氢壳窗口"), core.ui.shellWindowArrange()),
        shellWindowReset: (id) => (need("ui", "重置氢壳窗口"), core.ui.shellWindowReset(id)),
        shellWindowLayout: () => (need("ui", "读取氢壳布局"), core.ui.shellWindowLayout()),
        shellScrollRootController: (fn) => (need("ui", "注册氢壳滚动根"), own(core.ui.registerShellScrollRoot(fn))),
        shellScrollRoot: () => (need("ui", "读取氢壳滚动根"), core.ui.shellScrollRoot()),
        shellScrollBridge: (options) => {
          need("ui", "安装氢壳滚动桥");
          let bridge = installShellScrollBridge(options);
          return own(() => bridge.dispose()), bridge;
        },
        shellStyle: Object.freeze({
          sanitizeTokenValue: (name, value) => (need("ui", "读取氢壳样式函数"), sanitizeTokenValue(name, value)),
          mergeShellTokens: (globalTokens, overrides) => (need("ui", "读取氢壳样式函数"), mergeShellTokens(globalTokens, overrides)),
          tokenCss: (tokens) => (need("ui", "读取氢壳样式函数"), tokenCss(tokens)),
          moduleInspectorModel: (layout, id) => (need("ui", "读取氢壳样式函数"), moduleInspectorModel(layout, id))
        }),
        shellMedia: Object.freeze({
          isHttpsUrl: (value) => (need("ui", "读取氢壳媒体函数"), isHttpsUrl(value)),
          validateMediaFile: (file, options) => (need("ui", "读取氢壳媒体函数"), validateMediaFile(file, options)),
          validateMediaDescriptor: (kind, descriptor) => (need("ui", "读取氢壳媒体描述"), validateMediaDescriptor(kind, descriptor)),
          openMediaDb: (indexedDBRef, name) => (need("ui", "打开氢壳媒体存储"), openMediaDb(indexedDBRef, name)),
          readMedia: (options) => (need("ui", "读取氢壳媒体存储"), readMedia(options)),
          writeMedia: (options) => (need("ui", "写入氢壳媒体存储"), writeMedia(options)),
          clearMedia: (options) => (need("ui", "删除氢壳媒体存储"), clearMedia(options)),
          loadFontFace: (options) => (need("ui", "加载氢壳字体"), loadFontFace(options))
        }),
        shellLayout: Object.freeze({
          widthBucket: (width) => (need("ui", "读取氢壳布局函数"), widthBucket(width)),
          layoutStorageKey: (origin, bucket) => (need("ui", "读取氢壳布局函数"), layoutStorageKey(origin, bucket)),
          snapRect: (rect, options) => (need("ui", "读取氢壳布局函数"), snapRect(rect, options)),
          sanitizeShellLayout: (raw, options) => (need("ui", "读取氢壳布局函数"), sanitizeShellLayout(raw, options)),
          defaultShellLayout: (options) => (need("ui", "读取氢壳布局函数"), defaultShellLayout(options)),
          arrangeShellWindows: (layout, registry, viewport) => (need("ui", "读取氢壳布局函数"), arrangeShellWindows(layout, registry, viewport)),
          migrateLegacyShellLayout: (options) => (need("ui", "读取氢壳布局函数"), migrateLegacyShellLayout(options))
        })
      },
      admin: {
        exportAll: () => {
          need("admin", "导出全部数据");
          let data = {};
          for (let k of rawKeys()) data[k] = rawGet(k);
          return { app: "lsb", version: VERSION, exportedAt: Date.now(), count: Object.keys(data).length, data };
        },
        importAll: (payload, opts = {}) => {
          need("admin", "导入全部数据");
          let merge = !!(opts && opts.merge);
          if (!payload || payload.app !== "lsb" || typeof payload.data != "object")
            throw new Error("备份文件格式不正确（缺少 app/data 字段）");
          let imported = 0, skipped = 0;
          for (let [k, v] of Object.entries(payload.data))
            if (k.startsWith(RAW_PREFIX)) {
              if (merge && rawGet(k) !== void 0) {
                skipped++;
                continue;
              }
              rawSet(k, v), imported++;
            }
          return { imported, skipped };
        }
      },
      dom: {
        each: (selector, fn) => (need("read", "监听 DOM"), own(core.dom.onEach(selector, fn, { owner: rec.id }))),
        posts: () => [...document.querySelectorAll(SEL.postEntry)],
        items: () => [...document.querySelectorAll(SEL.listItems)]
      },
      tabs: {
        post: (event, payload) => {
          need("events", "跨标签广播"), core.channel?.post({ plugin: rec.id, event, payload });
        },
        on: (event, fn) => (need("events", "跨标签订阅"), own(core.bus.on(`tab:${rec.id}:${event}`, fn, { owner: rec.id })))
      },
      election: (opts = {}) => {
        need("events", "参与选主");
        let el = new Election(api.tabs, {
          onPromote: opts.onPromote,
          onDemote: opts.onDemote,
          jitter: opts.jitter ?? 800,
          id: core.channel?.id ? `${core.channel.id}:${rec.id}` : void 0,
          beatMs: opts.beatMs,
          leaderTimeoutMs: opts.leaderTimeoutMs
        });
        return el.start(), own(() => el.stop()), el;
      },
      util: { esc, num, text, sleep, throttle, clone, satisfies },
      log: (...a) => core.log(rec.id, ...a),
      error: (msg) => {
        let e = msg instanceof Error ? msg : new Error(String(msg));
        core._pushErr({
          kind: "module-error",
          id: rec.id,
          msg: String(e.message),
          stack: String(e.stack || "").slice(0, 400)
        });
      },
      track: (event, detail) => {
        core._pushErr({ kind: "track", id: rec.id, msg: event + (detail ? " · " + String(detail) : "") });
      },
      onDispose: (fn) => own(fn)
    };
    return api;
  }

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
    if (!json || typeof json != "object") return null;
    let version = typeof json.version == "string" ? json.version.trim() : "";
    if (!version) return null;
    let url = typeof json.url == "string" ? json.url.trim() : "";
    return { version, url };
  }
  function classifyVersion(local, store) {
    if (!parseVersion(local) || !parseVersion(store)) return "invalid";
    let cmp = compareVersion(local, store);
    return cmp < 0 ? "behind" : cmp > 0 ? "ahead" : "equal";
  }
  function localOxygenVersion(plugins) {
    let suite = (plugins || []).find((p) => p.id === "suite");
    return suite && suite.version ? String(suite.version) : null;
  }
  function installHref(parsed, fallback) {
    return parsed && parsed.url || fallback;
  }
  function hostWindow() {
    return typeof unsafeWindow < "u" ? unsafeWindow : typeof window < "u" ? window : globalThis;
  }
  function isLtsChannel(win = hostWindow()) {
    return !!win && win.__LSB_CHANNEL__ === "lts";
  }
  function ltsDisplayVersion(win = hostWindow()) {
    let v = win && win.__LSB_LTS_VERSION__;
    return typeof v == "string" && v.trim() ? v.trim() : "";
  }

  // src/core/panels/log-tab.js
  function renderLogTab(host, core) {
    host.replaceChildren(), core._logViewState || (core._logViewState = { showErr: !0, showRun: !1, q: "" });
    let st = core._logViewState, fmtT = (t) => new Date(t).toLocaleTimeString("zh-CN"), render = () => {
      let errs = core.errors(), rows = [];
      st.showErr && rows.push(
        ...errs.map((e) => ({
          t: e.t,
          lvl: "err",
          who: e.id || e.kind,
          txt: `[${e.kind}${e.phase ? "/" + e.phase : ""}] ${e.msg}${e.n > 1 ? " ×" + e.n : ""} · ${e.page}`,
          tip: [e.stack, e.where].filter(Boolean).join(`
`)
        }))
      ), st.showRun && rows.push(
        ...core.logs().slice(-200).reverse().map((l) => ({ t: l.ts, lvl: "run", who: l.scope, txt: l.args.join(" "), tip: "" }))
      ), st.q && (rows = rows.filter((r) => (r.who + " " + r.txt).toLowerCase().includes(st.q))), rows.sort((a, b) => b.t - a.t), wrap.innerHTML = '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap"><label style="font-size:12px;display:flex;gap:4px;align-items:center"><input type="checkbox" data-e' + (st.showErr ? " checked" : "") + "> 错误 (" + errs.length + ')</label><label style="font-size:12px;display:flex;gap:4px;align-items:center"><input type="checkbox" data-r' + (st.showRun ? " checked" : "") + '> 运行日志</label><input type="search" placeholder="过滤…" data-q value="' + esc(st.q).replace(/"/g, "&quot;") + '" style="flex:1;min-width:120px;padding:4px 7px;border:1px solid var(--line,#ddd);border-radius:6px;background:var(--bg,#fff);color:var(--text,#222)"><button class="lsb-btn" data-export>导出</button><button class="lsb-btn" data-clear>清空错误</button></div><div style="max-height:52vh;overflow:auto;border-top:1px solid var(--line-soft,#eee)">' + (rows.length ? rows.map(
        (r) => '<div class="lsb-row"' + (r.tip ? ' title="' + esc(r.tip).replace(/"/g, "&quot;") + '"' : "") + '><span style="color:var(--text-muted,#888);font-size:11px;min-width:64px">' + fmtT(r.t) + '</span><span class="lsb-badge' + (r.lvl === "err" ? " is-err" : "") + '">' + esc(String(r.who)) + '</span><span style="margin-left:8px;font-size:12px;word-break:break-word">' + esc(r.txt) + "</span></div>"
      ).join("") : '<div class="lsb-empty">暂无记录。</div>') + "</div>", wrap.querySelector("[data-e]").onchange = (e) => {
        st.showErr = e.target.checked, render();
      }, wrap.querySelector("[data-r]").onchange = (e) => {
        st.showRun = e.target.checked, render();
      }, wrap.querySelector("[data-q]").oninput = (e) => {
        st.q = e.target.value.toLowerCase(), render();
      }, wrap.querySelector("[data-clear]").onclick = async () => {
        await core.ui.confirm("清空全部错误记录？") && (core.clearErrors(), render());
      }, wrap.querySelector("[data-export]").onclick = () => {
        try {
          let blob = new Blob([JSON.stringify({ errors: core.errors(), runLog: core.logs() }, null, 2)], {
            type: "application/json"
          }), a = document.createElement("a");
          a.href = URL.createObjectURL(blob), a.download = "lsb-logs-" + Date.now() + ".json", a.click(), setTimeout(() => URL.revokeObjectURL(a.href), 4e3);
        } catch (e) {
          core.ui.toast("导出失败：" + e.message, { type: "error" });
        }
      };
    }, wrap = document.createElement("div");
    host.appendChild(wrap), render();
  }

  // src/core/panels/update-tab.js
  function renderUpdateTab(host, core) {
    let wrap = document.createElement("div");
    host.appendChild(wrap);
    let gen = 0, inflight = null, lts = isLtsChannel(), scripts = lts ? { lts: SCRIPTS.find((s) => s.id === "lts") } : {
      hydrogen: SCRIPTS.find((s) => s.id === "hydrogen"),
      oxygen: SCRIPTS.find((s) => s.id === "oxygen")
    }, snapshot2 = () => {
      if (lts)
        return { lts: { local: ltsDisplayVersion() || VERSION, missing: !1 } };
      let ox = localOxygenVersion([...core.plugins.values()]);
      return {
        hydrogen: { local: VERSION, missing: !1 },
        oxygen: { local: ox, missing: !ox }
      };
    }, paint = (states, { busy = !1 } = {}) => {
      let loc = snapshot2(), badgeClass = (status) => status === "behind" || status === "fail" || status === "invalid" ? "lsb-badge is-err" : status === "equal" ? "lsb-badge is-on" : "lsb-badge", badgeText = (st) => !st || !st.status ? "" : {
        behind: "有更新",
        equal: "已是最新",
        ahead: "比商店新",
        missing: "未安装",
        invalid: "版本号无效",
        fail: "查询失败",
        unlisted: ""
      }[st.status] || "", desc = (id, st) => {
        let local = loc[id].local;
        return !st || !st.status ? local ? `本地 ${local}` : "" : st.status === "missing" ? "" : st.status === "unlisted" ? "LTS 商店页公布后即可对照" : st.status === "behind" || st.status === "ahead" ? `本地 ${local} · 商店 ${st.store}` : st.status === "equal" ? `本地与商店同为 ${local}` : st.status === "invalid" ? [local, st.store].filter(Boolean).join(" · ") : st.status === "fail" ? st.connect ? id === "lts" ? "LTS 需要允许 greasyfork.org 跨域" : "氢需要允许 greasyfork.org 跨域" : "无法读取 Greasy Fork" : "";
      }, install2 = (id, st) => {
        let script = scripts[id];
        if (!(st && (st.status === "behind" || st.status === "missing"))) return "";
        let href = st.status === "missing" ? script.installUrl : installHref(st.parsed, script.installUrl);
        return `<a class="lsb-btn is-primary" data-install href="${esc(href)}" target="_blank" rel="noopener noreferrer">打开安装页</a>`;
      }, row = (id) => {
        let st = states[id] || (loc[id].missing ? { status: "missing" } : null), local = loc[id].local, bt = badgeText(st), ver = local ? `<span class="lsb-badge">v${esc(local)}</span>` : "", bd = bt ? `<span class="${badgeClass(st.status)}">${esc(bt)}</span>` : "", d = desc(id, st);
        return `<div class="lsb-row" data-script="${id}">
          <div class="lsb-row-main">
            <div class="lsb-row-name">${esc(scripts[id].label)} ${ver}${bd}</div>
            ${d ? `<div class="lsb-row-desc">${esc(d)}</div>` : ""}
          </div>${install2(id, st)}</div>`;
      }, rows = lts ? row("lts") : row("hydrogen") + row("oxygen"), footer = lts ? "安装仍由油猴接管。请只留 LINUX.SB（LTS），不要同时开氢或氧。" : "安装仍由油猴接管；两个都要装，先氢后氧。";
      wrap.innerHTML = `<div class="lsb-actions" style="border:0;padding:0 0 8px;justify-content:flex-start"><button class="lsb-btn is-primary" type="button" data-check${busy ? " disabled" : ""}>${busy ? "查询中…" : "对照 Greasy Fork"}</button></div>` + rows + `<div class="lsb-row-desc">${footer}</div>`;
      let btn = wrap.querySelector("[data-check]");
      btn && !busy && (btn.onclick = () => run());
    }, loadOne = async (script) => {
      try {
        let json = await core.net.json(gfJsonUrl(script.gfId), { external: !0 }), parsed = parseStoreScript(json);
        return parsed ? { parsed } : { error: "read" };
      } catch (e) {
        let msg = String(e && e.message || e);
        return { error: /域名未放行|跨域请求被拒绝/.test(msg) ? "connect" : "read" };
      }
    }, fromLoad = (res, local) => {
      if (res.status !== "fulfilled")
        return { status: "fail", connect: !1 };
      let v = res.value;
      return v.error === "connect" ? { status: "fail", connect: !0 } : v.error ? { status: "fail", connect: !1 } : { status: classifyVersion(local, v.parsed.version), store: v.parsed.version, parsed: v.parsed };
    }, run = () => {
      if (lts) {
        let script = scripts.lts;
        if (!script.gfId) {
          paint({ lts: { status: "unlisted" } });
          return;
        }
        if (inflight) return inflight;
        let my2 = ++gen;
        return inflight = (async () => {
          paint({}, { busy: !0 });
          let loc = snapshot2(), settled = await Promise.allSettled([loadOne(script)]);
          if (my2 !== gen || !wrap.isConnected) return;
          let states = { lts: fromLoad(settled[0], loc.lts.local) };
          states.lts.status === "fail" && core.log("core", "检查更新查询失败"), paint(states);
        })().finally(() => {
          inflight && my2 === gen && (inflight = null);
        }), inflight;
      }
      if (inflight) return inflight;
      let my = ++gen;
      return inflight = (async () => {
        paint({ oxygen: snapshot2().oxygen.missing ? { status: "missing" } : null }, { busy: !0 });
        let loc = snapshot2(), jobs = [loadOne(scripts.hydrogen)];
        loc.oxygen.missing || jobs.push(loadOne(scripts.oxygen));
        let settled = await Promise.allSettled(jobs);
        if (my !== gen || !wrap.isConnected) return;
        let hRes = settled[0], states = { hydrogen: fromLoad(hRes, loc.hydrogen.local) };
        loc.oxygen.missing ? states.oxygen = { status: "missing" } : states.oxygen = fromLoad(settled[1], loc.oxygen.local), (states.hydrogen.status === "fail" || states.oxygen.status === "fail") && core.log("core", "检查更新查询失败"), paint(states);
      })().finally(() => {
        inflight && my === gen && (inflight = null);
      }), inflight;
    };
    paint(lts ? scripts.lts.gfId ? {} : { lts: { status: "unlisted" } } : { oxygen: snapshot2().oxygen.missing ? { status: "missing" } : null });
  }

  // src/core/panels/plugin-list.js
  function renderPluginList(host, core) {
    if (!core.plugins.size) {
      host.innerHTML = '<div class="lsb-empty">尚未加载任何插件。安装依附脚本后会自动出现在这里。</div>';
      return;
    }
    for (let rec of core.plugins.values()) {
      let row = document.createElement("div");
      row.className = "lsb-row";
      let stateLabel = { active: "运行中", disabled: "已停用", error: "出错", skipped: "本页不适用", registered: "等待依赖" }[rec.state], cls = rec.state === "active" ? " is-on" : rec.state === "error" ? " is-err" : "";
      row.innerHTML = `
        <div class="lsb-row-main">
          <div class="lsb-row-name">${esc(rec.name)} <span class="lsb-badge">v${esc(rec.version)}</span><span class="lsb-badge${cls}">${esc(stateLabel)}</span></div>
          <div class="lsb-row-desc">${esc(rec.description || rec.id)}${rec.error ? ` · ${esc(rec.error)}` : ""}</div>
          <div class="lsb-row-desc">权限：${esc(rec.permissions.join(" / "))}</div>
        </div>`;
      let btn = document.createElement("button");
      btn.className = "lsb-btn", btn.textContent = rec.state === "disabled" ? "启用" : "停用", btn.onclick = () => {
        rec.state === "disabled" ? core.enable(rec.id) : core.disable(rec.id), core.ui.toast("设置已生效，刷新页面后完全应用", { type: "info" }), host.innerHTML = "", renderPluginList(host, core);
      }, row.appendChild(btn), host.appendChild(row);
    }
  }

  // src/core/panels/base-settings.js
  function renderBaseSettings(host, core) {
    let schema = {
      rate: { type: "number", label: "请求最小间隔 (ms)", desc: "所有插件共享同一队列，过低会触发站点限流", default: 900 },
      urlPoll: { type: "number", label: "URL 变化轮询 (ms)", desc: "无限滚动时追踪 ?p= 变化；0 = 只靠 popstate 事件", default: 700 },
      launcher: { type: "switch", label: "显示右下角入口按钮", default: !0 },
      debug: { type: "switch", label: "调试日志", default: !1 }
    }, cur = {
      rate: coreStore.get("rate", 900),
      urlPoll: coreStore.get("urlPoll", 700),
      launcher: coreStore.get("launcher", !0),
      debug: coreStore.get("debug", !1)
    };
    core.ui.buildForm(host, schema, cur, (v) => {
      coreStore.set("rate", Math.max(200, Number(v.rate) || 900)), coreStore.set("urlPoll", Math.max(0, Number(v.urlPoll) || 0)), coreStore.set("launcher", !!v.launcher), coreStore.set("debug", !!v.debug), core.net.rate = coreStore.get("rate", 900), core.debug = !!v.debug;
    });
    let info = document.createElement("div");
    info.className = "lsb-row-desc", info.style.marginTop = "12px", info.textContent = `页面：${core.snapshot.page.type} · 站点版本：${core.snapshot.version || "未知"} · 身份：${core.snapshot.me.guest ? "访客" : `${core.snapshot.me.name || "uid " + core.snapshot.me.uid}`} · CSRF：${core.snapshot.csrf ? "已获取" : "无"}`, host.appendChild(info);
  }

  // src/core.js
  var PluginRecord = class {
    constructor(manifest, setup) {
      this.id = manifest.id, this.name = manifest.name || manifest.id, this.version = manifest.version || "0.0.0", this.author = manifest.author || null, this.description = manifest.description || "", this.requires = manifest.requires || {}, this.permissions = manifest.permissions || DEFAULT_PERMISSIONS, this.pages = manifest.pages || null, this.provides = manifest.provides || [], this.configSchema = manifest.config || null, this.configTabRenderer = null, this.setup = setup, this.state = "registered", this.error = null, this.disposers = [], this.exports = null, this.abortController = null, this.context = null;
    }
  }, Core = class {
    constructor() {
      this.version = VERSION, this.ready = !1, this.debug = !!coreStore.get("debug", !1), this.plugins = /* @__PURE__ */ new Map(), this._logs = [], this.bus = new Bus({
        onError: (e, info) => this._onPluginError(info.owner, e, `event ${info.event}`)
      }), this.net = new Net({
        rate: coreStore.get("rate", 900),
        log: (m) => this.log("net", m),
        gmRequest: typeof GM_xmlhttpRequest == "function" ? GM_xmlhttpRequest : null
      }), this.actions = new Actions(this.net), this.requestBroker = new RequestBroker({
        transport: (url, options) => this.net.transport(url, options),
        snapshot: () => this.snapshot || {},
        origin: this.net.origin,
        trace: (event) => this.log("runtime.request", safeStr(event))
      }), this.actionBroker = new ActionBroker({
        snapshot: () => this.snapshot || {},
        request: (intent) => this.requestBroker.request(intent),
        trace: (event) => this.log("runtime.action", safeStr(event))
      }), this.ui = new UI({
        title: isLtsChannel() ? "LINUX.SB · LTS" : "LINUX.SB · 氢",
        version: isLtsChannel() ? ltsDisplayVersion() || VERSION : VERSION
      }), this.dom = new DomWatcher(this.bus), this.site = site_exports, this.channel = null, this.snapshot = null, this._bootOff = [], this._errs = coreStore.get("errorlog", []) || [];
    }
    /* ─────────── 日志 ─────────── */
    log(scope, ...args) {
      let line = { ts: Date.now(), scope, args: args.map((a) => typeof a == "string" ? a : safeStr(a)) };
      this._logs.push(line), this._logs.length > 500 && this._logs.shift(), this.debug && console.log(`%c[LSB:${scope}]`, "color:#5eaaa0", ...args);
    }
    logs() {
      return [...this._logs];
    }
    /** 持久化错误日志（跨页面留存，最近 200 条） */
    errors() {
      return [...this._errs];
    }
    clearErrors() {
      this._errs = [], coreStore.set("errorlog", []), this.bus.emit("core:errors-cleared", null, { source: "core" });
    }
    /**
     * 错误入账：2 秒内同源同类合并计数防风暴；写存储持久化；广播供日志面板实时刷新。
     * entry: { kind, id?, phase?, msg, stack?, where? }
     */
    _pushErr(entry) {
      if (this._inErrEmit) return;
      let e = { t: Date.now(), page: this.snapshot?.page?.type || "?", n: 1, ...entry }, dup = this._errs.find(
        (x) => x.kind === e.kind && x.id === e.id && x.msg === e.msg && e.t - x.t < 2e3
      );
      dup ? (dup.n++, dup.t = e.t) : (this._errs.unshift(e), this._errs.length > 200 && (this._errs.length = 200));
      try {
        coreStore.set("errorlog", this._errs);
      } catch {
      }
      this._inErrEmit = !0;
      try {
        this.bus.emit("core:error-logged", { ...e }, { source: "core" }), this.bus.emit(
          "plugin:error",
          { id: e.id || e.kind, phase: e.phase || e.kind, message: e.msg },
          { source: "core" }
        );
      } finally {
        this._inErrEmit = !1;
      }
      this.debug && console.error(`%c[LSB:${e.kind}]`, "color:#d55", e);
    }
    /* ─────────── 启动 ─────────── */
    boot() {
      if (this.ready) return this;
      this.snapshot = snapshot(document, location), this._sealSnapshot(), this.net.setCsrf(this.snapshot.csrf), this.channel = new Channel(this.bus, { store: coreStore }), this.dom.start(document.body), this.ui.ensureBase(), coreStore.get("launcher", !0) && this.ui.mountLauncher(), this._registerCoreTabs(), this._bootOff = [];
      let onErr = (ev) => {
        let msg0 = String(ev.message || "");
        /^ResizeObserver loop/i.test(msg0) || this._pushErr({
          kind: "uncaught",
          msg: String(ev.message || ev.error && ev.error.message || "unknown error"),
          stack: String(ev.error && ev.error.stack || "").slice(0, 400),
          where: (ev.filename || "") + ":" + (ev.lineno || 0)
        });
      }, onRej = (ev) => {
        let r = ev.reason;
        this._pushErr({
          kind: "rejection",
          msg: String(r && r.message || r || "unknown rejection"),
          stack: String(r && r.stack || "").slice(0, 400)
        });
      };
      return window.addEventListener("error", onErr), window.addEventListener("unhandledrejection", onRej), this._bootOff.push(() => window.removeEventListener("error", onErr)), this._bootOff.push(() => window.removeEventListener("unhandledrejection", onRej)), this.bus.on(
        "core:error-logged",
        () => {
          if (this.ui._panel && this.ui._active === "__core_logs") {
            let host = this.ui._panel.panel.querySelector(".lsb-view");
            host && this._renderLogTab(host);
          }
        },
        { owner: "__core" }
      ), this.ready = !0, this.log("core", `启动 v${VERSION}`, this.snapshot.page.type, this.snapshot.me.guest ? "访客" : `uid=${this.snapshot.me.uid}`), this.bus.emit("site:ready", this.snapshot, { sticky: !0, source: "core", raw: !0 }), this._activateAll(), this._watchNavigation(), this;
    }
    /** 站点为多页面导航 + 原生无限滚动；这里把 DOM 增量与 URL 变化都归一成事件 */
    _watchNavigation() {
      this.bus.on(
        "dom:posts-added",
        (posts) => {
          let parsed = posts.map((el) => parsePost(el));
          this.bus.emit("topic:posts-added", parsed, { source: "core", raw: !0 });
        },
        { owner: "__core" }
      ), this._watchUrl();
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
        this.snapshot = snapshot(document, location, this.snapshot), this._sealSnapshot(), this.net.setCsrf(this.snapshot.csrf);
      } catch {
        try {
          this.snapshot && (this.snapshot.page = detectPage(window.location));
        } catch {
        }
      }
    }
    /** 只冻 me / forums：整份 snapshot 含 DOM 节点，不能冻 */
    _sealSnapshot() {
      let s = this.snapshot;
      s && (s.me && deepFreeze(s.me), s.forums && deepFreeze(s.forums));
    }
    /** pages: 限定的插件随路由启停；无 pages 的插件不受影响 */
    _syncPagePlugins() {
      let type = this.snapshot?.page?.type;
      if (type) {
        for (let rec of this.plugins.values()) {
          if (!rec.pages) continue;
          let inScope = rec.pages.includes(type);
          rec.state === "active" && !inScope ? (this._dispose(rec), rec.state = "skipped", rec.error = `不适用于 ${type} 页`, this.log("core", `停用 ${rec.id}：离开 ${rec.pages.join("/")} 页`)) : rec.state === "skipped" && inScope && !coreStore.get(`disabled:${rec.id}`, !1) && (rec.state = "registered", rec.error = null);
        }
        this._activateAll();
      }
    }
    _watchUrl() {
      let lastHref = window.location.href, check = () => {
        window.location.href !== lastHref && (lastHref = window.location.href, this._refreshSnapshot(), this.log("core", `路由 → ${this.snapshot.page.type}`, lastHref), this.bus.emit("route:changed", { href: lastHref, page: clone(this.snapshot.page) }, { source: "core" }), this._syncPagePlugins());
      }, wins = [window];
      typeof unsafeWindow < "u" && unsafeWindow !== window && wins.push(unsafeWindow);
      for (let w of wins)
        w.addEventListener("popstate", check), w.addEventListener("hashchange", check), this._bootOff.push(() => {
          w.removeEventListener("popstate", check), w.removeEventListener("hashchange", check);
        });
      let iv = Number(coreStore.get("urlPoll", 700));
      iv > 0 && (this._urlTimer = setInterval(check, iv), this._urlTimer?.unref?.());
    }
    /** 拆掉基座自身的全局副作用（测试与热重载用；正常页面生命周期不需要） */
    shutdown() {
      this._urlTimer && clearInterval(this._urlTimer), this._urlTimer = null;
      for (let off of this._bootOff || [])
        try {
          off();
        } catch {
        }
      this._bootOff = [], this.bus.offOwner("__core"), this.dom.stop(), this.channel?.close();
      for (let rec of this.plugins.values())
        rec.state === "active" && this._dispose(rec);
      this.ready = !1;
    }
    /* ─────────── 插件注册 ─────────── */
    /**
     * @param {object} manifest { id, name, version, requires, permissions, pages, config }
     * @param {(api)=>any} setup 插件主体，返回值作为 exports 供其它插件读取
     */
    register(manifest, setup) {
      if (!manifest || !manifest.id) throw new Error("register: manifest.id 必填");
      if (typeof setup != "function") throw new Error(`register(${manifest.id}): setup 必须是函数`);
      if (!/^[a-z0-9-]+$/.test(manifest.id)) throw new Error(`register: 非法 id "${manifest.id}"（仅小写字母/数字/连字符）`);
      if (manifest.version && !/^\d+\.\d+\.\d+/.test(manifest.version) && console.warn(`[LSB] 插件 ${manifest.id} 版本号 "${manifest.version}" 不符合 semver`), manifest.config && typeof manifest.config != "object") throw new Error(`register(${manifest.id}): config 必须是对象`);
      if (this.plugins.has(manifest.id))
        return this.log("core", `插件 ${manifest.id} 重复注册，已忽略`), this.plugins.get(manifest.id);
      let rec = new PluginRecord(manifest, setup);
      return this.plugins.set(rec.id, rec), this.log("core", `注册插件 ${rec.id}@${rec.version}`), this.bus.emit("plugin:registered", { id: rec.id, version: rec.version }, { source: "core" }), this._ensureConfigTab(rec), this.ready && this._activateAll(), rec;
    }
    _renderConfigForm(rec, host) {
      if (!rec.configSchema) {
        host.innerHTML = '<div class="lsb-empty">该插件未声明配置项。</div>';
        return;
      }
      let store = makeStore(rec.id);
      this.ui.buildForm(host, rec.configSchema, store.config(rec.configSchema), (v) => {
        store.saveConfig(v), this.bus.emit(`config:changed:${rec.id}`, v, { source: "core" });
      });
    }
    /**
     * 有 config schema 的插件，设置页在 register 时就挂上。
     * pages 限定插件在非适用页是 skipped、setup 不会跑，但 API Key 这类配置
     * 必须在首页也能改，不能逼用户先进帖子。
     */
    _ensureConfigTab(rec) {
      !rec.configSchema || rec._configTabReady || (rec._configTabReady = !0, this.ui.registerTab({
        id: rec.id,
        name: rec.name,
        order: 50,
        render: (host) => this._renderConfigForm(rec, host)
      }));
    }
    /** 反复扫描直到没有新插件能被激活（解决插件间依赖顺序问题） */
    _activateAll() {
      let progressed = !0;
      for (; progressed; ) {
        progressed = !1;
        for (let rec of this.plugins.values()) {
          if (rec.state !== "registered") continue;
          let verdict = this._canActivate(rec);
          verdict.ok ? (this._activate(rec), progressed = !0) : verdict.fatal && (rec.state = verdict.state, rec.error = verdict.reason, this.log("core", `跳过 ${rec.id}：${verdict.reason}`), progressed = !0);
        }
      }
      let pending = [...this.plugins.values()].filter((r) => r.state === "registered");
      if (pending.length) {
        let waitingIds = new Set(pending.map((r) => r.id));
        for (let rec of pending) {
          let deps = Object.keys(rec.requires.plugins || {});
          deps.some((d) => waitingIds.has(d)) && (rec.state = "error", rec.error = `循环依赖（${deps.join(", ")}）`, this.log("core", `跳过 ${rec.id}：${rec.error}`));
        }
      }
    }
    _canActivate(rec) {
      if (coreStore.get(`disabled:${rec.id}`, !1))
        return { ok: !1, fatal: !0, state: "disabled", reason: "用户已停用" };
      let baseRange = rec.requires.base, legacyBaseBridge = /^\^0\.(?:1|2)\./.test(String(baseRange || "")) && /^2\./.test(VERSION);
      if (baseRange && !satisfies(VERSION, baseRange) && !legacyBaseBridge)
        return { ok: !1, fatal: !0, state: "error", reason: `需要基座 ${baseRange}，当前 ${VERSION}` };
      if (rec.pages && !rec.pages.includes(this.snapshot.page.type))
        return { ok: !1, fatal: !0, state: "skipped", reason: `不适用于 ${this.snapshot.page.type} 页` };
      for (let [dep, range] of Object.entries(rec.requires.plugins || {})) {
        let d = this.plugins.get(dep);
        if (!d) return { ok: !1, fatal: !1, reason: `等待依赖 ${dep}` };
        if (d.state === "error" || d.state === "disabled" || d.state === "skipped")
          return { ok: !1, fatal: !0, state: "error", reason: `依赖 ${dep} 不可用（${d.state}）` };
        if (d.state !== "active") return { ok: !1, fatal: !1, reason: `等待依赖 ${dep} 激活` };
        if (range && !satisfies(d.version, range))
          return { ok: !1, fatal: !0, state: "error", reason: `依赖 ${dep} 需要 ${range}，实际 ${d.version}` };
      }
      return { ok: !0 };
    }
    _activate(rec) {
      rec.abortController = new AbortController(), rec.context = createCapabilityContext(
        { id: rec.id, permissions: rec.permissions },
        { signal: rec.abortController.signal }
      );
      let api = this._makeApi(rec);
      try {
        rec.exports = rec.setup(api) || null, rec.state = "active", this.log("core", `激活 ${rec.id}`), this.bus.emit("plugin:activated", { id: rec.id, version: rec.version }, { source: "core" });
      } catch (e) {
        rec.state = "error", rec.error = e.message, this._onPluginError(rec.id, e, "setup"), this._dispose(rec);
      }
    }
    _dispose(rec) {
      try {
        rec.abortController?.abort();
      } catch {
      }
      try {
        rec.context?.dispose();
      } catch {
      }
      rec.context = null;
      for (let fn of rec.disposers.splice(0))
        try {
          fn();
        } catch (e) {
          console.error(`[LSB] ${rec.id} 清理失败`, e);
        }
      this.bus.offOwner(rec.id), this.dom.offOwner(rec.id), this.ai?.dispose(rec.id);
    }
    disable(id) {
      let rec = this.plugins.get(id);
      return rec ? (coreStore.set(`disabled:${id}`, !0), this._dispose(rec), rec.state = "disabled", this.bus.emit("plugin:disabled", { id }, { source: "core" }), !0) : !1;
    }
    enable(id) {
      coreStore.del(`disabled:${id}`);
      let rec = this.plugins.get(id);
      return rec ? (rec.state === "disabled" && (rec.state = "registered", rec.error = null, this._activateAll()), !0) : !1;
    }
    _onPluginError(owner, err, phase) {
      this.log("error", `${owner} @ ${phase}: ${err?.message || err}`), console.error(`[LSB] 插件 ${owner} 在 ${phase} 出错`, err), this._pushErr({
        kind: "plugin-error",
        id: owner,
        phase,
        msg: String(err && err.message || err),
        stack: String(err && err.stack || "").slice(0, 400)
      });
    }
    /* ─────────── 插件 API（每插件一份，带权限校验与自动清理） ─────────── */
    _makeApi(rec) {
      return createPluginApi(rec, this);
    }
    /* ─────────── 核心自带面板 ─────────── */
    _registerCoreTabs() {
      this.ui.registerTab({
        id: "__core_logs",
        name: "运行日志",
        order: 2,
        render: (host) => renderLogTab(host, this)
      }), this.ui.registerTab({
        id: "__core_plugins",
        name: "插件",
        order: 0,
        render: (host) => renderPluginList(host, this)
      }), this.ui.registerTab({
        id: "__core_settings",
        name: "基座设置",
        order: 1,
        render: (host) => renderBaseSettings(host, this)
      }), this.ui.registerTab({
        id: "__core_updates",
        name: "检查更新",
        order: 3,
        render: (host) => renderUpdateTab(host, this)
      });
    }
    _renderLogTab(host) {
      return renderLogTab(host, this);
    }
    _renderUpdateTab(host) {
      return renderUpdateTab(host, this);
    }
    _renderPluginList(host) {
      return renderPluginList(host, this);
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
      return typeof v == "object" ? JSON.stringify(v)?.slice(0, 300) : String(v);
    } catch {
      return String(v);
    }
  }

  // src/shell/boot.js
  var SHELL_BOOT_STYLE_ID = "lsb-shell-boot-style", SHELL_BOOT_CLASS = "lsb-canvas-boot", SHELL_BOOT_FRAME_ID = "lsb-shell-boot-frame", SHELL_NAVIGATING_CLASS = "lsb-canvas-navigating", CLOUDFLARE_CHALLENGE_ATTR = "data-lsb-cloudflare-challenge", CLOUDFLARE_CHALLENGE_OBSERVER_KEY = "__lsbCloudflareChallengeObserver", CLOUDFLARE_CHALLENGE_MARKERS = "#challenge-stage, #challenge-form, #challenge-running, #cf-challenge-running, .cf-browser-verification, [data-cf-challenge]", CLOUDFLARE_TITLE_COPY = /(?:just a moment|attention required|checking your browser|checking if (?:the )?site connection is secure)/i, CLOUDFLARE_BODY_COPY = /(?:checking your browser|verify (?:that )?you are human|enable javascript and cookies to continue|performing (?:a )?security (?:check|verification)|complete (?:the )?security check|请完成.{0,12}验证|请进行.{0,12}验证|正在验证|人机验证)/i, SHELL_NAVIGATING_ATTR = "data-lsb-navigation", NAVIGATION_GUARD_KEY = "__lsbShellNavigationGuard", BOOT_CSS = `
html.lsb-canvas-boot{
  background:var(--bg,#f4f5f7);
}
#lsb-shell-boot-frame{pointer-events:none}
#lsb-shell-boot-frame > [data-boot="canvas"]{
  position:fixed;inset:0;z-index:7990;
  background:var(--bg,#f4f5f7);
}
html.lsb-canvas-boot .forum-enhancements-left-fixed{display:none!important}
html.lsb-canvas-boot > body > .top,
html.lsb-canvas-boot .forum-more-region{display:none!important}
html.lsb-canvas-boot aside.sidebar:not(#mobile-menu-drawer):not(.mobile-menu-drawer){display:none!important}
html.lsb-canvas-boot .forum-layout.forum-layout-has-sidebar{
  display:block!important;grid-template-columns:1fr!important;
}
html.lsb-canvas-boot main.wrap{
  max-width:none!important;margin-left:0!important;margin-right:0!important;width:auto!important;
}
html.lsb-canvas-boot .lsb-launcher{display:none!important}
html.lsb-canvas-navigating .forum-enhancements-left-fixed{display:none!important}
html.lsb-canvas-navigating > body > .top,
html.lsb-canvas-navigating .forum-more-region{display:none!important}
html.lsb-canvas-navigating aside.sidebar:not(#mobile-menu-drawer):not(.mobile-menu-drawer){display:none!important}
html.lsb-canvas-navigating .lsb-launcher{display:none!important}
`;
  function bootVideoCss() {
    let cfg = rawGet("lsb_base:skin:__config") || {}, url = String(cfg.backgroundVideoUrl || "").trim();
    if (cfg.backgroundVideoEnabled !== !0 || !/^https:\/\//i.test(url)) return "";
    try {
      if (new URL(url).protocol !== "https:") return "";
    } catch {
      return "";
    }
    return `
html.lsb-canvas-boot{background-image:url(${JSON.stringify(url)});background-size:cover;background-position:center;background-attachment:fixed}`;
  }
  function isVisibleChallengeCopy(node, doc) {
    let view = doc.defaultView;
    for (let current = node; current?.nodeType === 1; current = current.parentElement) {
      if (current.hidden || current.getAttribute?.("aria-hidden") === "true") return !1;
      let style = view?.getComputedStyle?.(current);
      if (style && (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0")) return !1;
      if (current === doc.body || !current.parentElement) break;
    }
    return !0;
  }
  function isCloudflareChallengePage(doc) {
    if (!doc?.querySelector?.(CLOUDFLARE_CHALLENGE_MARKERS)) return !1;
    if (CLOUDFLARE_TITLE_COPY.test(String(doc.title || ""))) return !0;
    let copyNodes = doc.querySelectorAll('h1, h2, h3, p, [role="heading"], #challenge-error-text, #challenge-body-text, [data-cf-challenge-message]');
    for (let node of copyNodes)
      if (isVisibleChallengeCopy(node, doc) && CLOUDFLARE_BODY_COPY.test(node.textContent || "")) return !0;
    return !1;
  }
  function releaseBootVisualsForChallenge(doc) {
    ensureBootStyle(doc);
    let root = doc.documentElement;
    root?.classList.contains(SHELL_BOOT_CLASS) && root.classList.remove(SHELL_BOOT_CLASS);
    let frame = doc.getElementById(SHELL_BOOT_FRAME_ID);
    frame && frame.remove();
  }
  function bindCloudflareChallengeObserver(doc) {
    if (!doc?.documentElement || doc[CLOUDFLARE_CHALLENGE_OBSERVER_KEY]) return;
    let Observer = doc.defaultView?.MutationObserver;
    if (typeof Observer != "function") return;
    let observer = new Observer(() => {
      if (!shouldShellBoot()) return;
      let root = doc.documentElement, wasChallenge = root.getAttribute(CLOUDFLARE_CHALLENGE_ATTR) === "true";
      if (isCloudflareChallengePage(doc)) {
        wasChallenge || root.setAttribute(CLOUDFLARE_CHALLENGE_ATTR, "true"), releaseBootVisualsForChallenge(doc);
        return;
      }
      wasChallenge && (root.removeAttribute(CLOUDFLARE_CHALLENGE_ATTR), applyShellBoot(doc));
    });
    observer.observe(doc.documentElement, {
      childList: !0,
      subtree: !0,
      characterData: !0,
      attributes: !0,
      attributeFilter: ["id", "class", "hidden", "style", "aria-hidden", "data-cf-challenge"]
    }), doc[CLOUDFLARE_CHALLENGE_OBSERVER_KEY] = observer;
  }
  function unbindCloudflareChallengeObserver(doc) {
    let observer = doc?.[CLOUDFLARE_CHALLENGE_OBSERVER_KEY];
    if (observer) {
      observer.disconnect();
      try {
        delete doc[CLOUDFLARE_CHALLENGE_OBSERVER_KEY];
      } catch {
      }
    }
  }
  function shouldShellBoot() {
    if (rawGet("lsb_base:__core:disabled:skin") === !0) return !1;
    let cfg = rawGet("lsb_base:skin:__config");
    return !(cfg && cfg.shell === !1 || cfg?.uiMode !== "ios27");
  }
  function ensureBootFrame(doc) {
    let root = doc.documentElement;
    if (!root || doc.getElementById(SHELL_BOOT_FRAME_ID)) return;
    let frame = doc.createElement("div");
    frame.id = SHELL_BOOT_FRAME_ID, frame.setAttribute("aria-hidden", "true"), frame.innerHTML = '<div data-boot="canvas"></div>', root.appendChild(frame);
  }
  function isTopicNavigation(anchor, doc) {
    let ElementCtor = doc.defaultView?.Element;
    if (!ElementCtor || !(anchor instanceof ElementCtor)) return !1;
    let eventTarget = anchor;
    if (eventTarget.hasAttribute("download") || eventTarget.target && eventTarget.target !== "_self" || /\bexternal\b/i.test(eventTarget.rel || "") || eventTarget.matches("[data-method], [data-confirm]")) return !1;
    let view = doc.defaultView, target;
    try {
      target = new URL(eventTarget.getAttribute("href") || eventTarget.href, view?.location?.href || "https://linux.sb/");
    } catch {
      return !1;
    }
    return !view?.location || target.origin !== view.location.origin || !/^\/topic\/\d+(?:\/|$)/.test(target.pathname) ? !1 : target.href !== view.location.href;
  }
  function armNavigation(doc) {
    let root = doc.documentElement;
    root && (root.classList.add(SHELL_NAVIGATING_CLASS), root.setAttribute(SHELL_NAVIGATING_ATTR, "leaving"));
  }
  function disarmNavigation(doc) {
    let root = doc.documentElement;
    root && (root.classList.remove(SHELL_NAVIGATING_CLASS), root.removeAttribute(SHELL_NAVIGATING_ATTR));
  }
  function bindNavigationGuard(doc) {
    if (!doc || doc[NAVIGATION_GUARD_KEY]) return;
    let onClick = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      let anchor = event.target?.closest?.("a[href]");
      if (anchor && isTopicNavigation(anchor, doc)) {
        armNavigation(doc);
        let clearIfCancelled = () => {
          event.defaultPrevented && disarmNavigation(doc);
        };
        typeof queueMicrotask == "function" ? queueMicrotask(clearIfCancelled) : Promise.resolve().then(clearIfCancelled);
      }
    };
    doc.addEventListener("click", onClick, !0), doc[NAVIGATION_GUARD_KEY] = onClick;
  }
  function unbindNavigationGuard(doc) {
    let onClick = doc?.[NAVIGATION_GUARD_KEY];
    if (onClick) {
      doc.removeEventListener("click", onClick, !0);
      try {
        delete doc[NAVIGATION_GUARD_KEY];
      } catch {
      }
    }
  }
  function ensureBootStyle(doc) {
    let root = doc.documentElement;
    if (!root) return null;
    if (!doc.getElementById(SHELL_BOOT_STYLE_ID)) {
      let el = doc.createElement("style");
      el.id = SHELL_BOOT_STYLE_ID;
      let parent = doc.head || root;
      parent.insertBefore(el, parent.firstChild);
    }
    let style = doc.getElementById(SHELL_BOOT_STYLE_ID), content = BOOT_CSS + bootVideoCss();
    return style && style.textContent !== content && (style.textContent = content), style;
  }
  function clearBootVisuals(doc) {
    doc.getElementById(SHELL_BOOT_STYLE_ID)?.remove(), doc.getElementById(SHELL_BOOT_FRAME_ID)?.remove(), doc.documentElement?.classList.remove(SHELL_BOOT_CLASS);
  }
  function clearShellBoot(doc = document) {
    unbindNavigationGuard(doc), unbindCloudflareChallengeObserver(doc), clearBootVisuals(doc), doc.documentElement?.removeAttribute(CLOUDFLARE_CHALLENGE_ATTR), doc.documentElement?.classList.remove(SHELL_NAVIGATING_CLASS), doc.documentElement?.removeAttribute(SHELL_NAVIGATING_ATTR);
  }
  function applyShellBoot(doc = document) {
    let root = doc.documentElement;
    if (!root) return;
    if (!shouldShellBoot()) {
      clearShellBoot(doc);
      return;
    }
    if (bindNavigationGuard(doc), bindCloudflareChallengeObserver(doc), isCloudflareChallengePage(doc)) {
      root.setAttribute(CLOUDFLARE_CHALLENGE_ATTR, "true"), releaseBootVisualsForChallenge(doc);
      return;
    }
    if (root.removeAttribute(CLOUDFLARE_CHALLENGE_ATTR), doc.getElementById("lsb-shell")?.getAttribute("data-lsb-canvas-shell") === "true") {
      root.classList.remove(SHELL_BOOT_CLASS), doc.getElementById(SHELL_BOOT_FRAME_ID)?.remove(), ensureBootStyle(doc);
      return;
    }
    root.classList.add(SHELL_BOOT_CLASS), ensureBootStyle(doc), ensureBootFrame(doc);
  }
  function watchShellBoot(bus) {
    if (!bus?.on) return;
    let sync = () => applyShellBoot();
    bus.on("config:changed:skin", sync, { owner: "__shell-boot" }), bus.on("plugin:disabled", sync, { owner: "__shell-boot" }), bus.on("plugin:activated", sync, { owner: "__shell-boot" });
  }

  // src/entry.js
  function inIframe() {
    try {
      return window.self !== window.top;
    } catch {
      return !0;
    }
  }
  inIframe() || applyShellBoot();
  var W = typeof unsafeWindow < "u" ? unsafeWindow : window;
  function install() {
    if (W.LSB && W.LSB.__core) return W.LSB;
    let core = new Core();
    watchShellBoot(core.bus);
    let LSB = {
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
    }, queue = Array.isArray(W.LSB_PLUGINS) ? W.LSB_PLUGINS.slice() : [];
    W.LSB = LSB, W.LSB_PLUGINS = {
      push(...items) {
        for (let it of items) applyQueued(LSB, it);
        return 0;
      },
      length: 0
    };
    let start = () => {
      core.boot();
      for (let it of queue) applyQueued(LSB, it);
      W.dispatchEvent(new W.CustomEvent("lsb:ready", { detail: { version: VERSION } }));
    };
    return document.body ? start() : document.addEventListener("DOMContentLoaded", start, { once: !0 }), LSB;
  }
  function applyQueued(LSB, item) {
    try {
      typeof item == "function" ? item(LSB) : item && item.manifest && item.setup && LSB.register(item.manifest, item.setup);
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
    version: '1.0.5',
    description: '看过的帖子在列表中变灰；读到当前评论数后清理站点未读提示',
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

    let topicSeenPosts = new Set()

    /* ── 标记侧：帖子页打开即视为已读（壳内跳转也走 route:changed，不能只在 setup 时记一次） ── */
    function markOpenTopic() {
      if (api.page.type !== 'topic') {
        topicSeenPosts = new Set()
        return
      }
      const tid = api.page.id
      topicSeenPosts = new Set(
        [...document.querySelectorAll('li.post-entry')]
          .map((li) => Number((li.id || '').match(/^post-(\d+)$/)?.[1] || 0))
          .filter(Boolean),
      )
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
      const fresh = posts.filter((post) => post.postId && !topicSeenPosts.has(post.postId))
      for (const post of posts) if (post.postId) topicSeenPosts.add(post.postId)
      // 软跳提交正文也会触发一次 posts-added；这些楼层已经在打开时计入水位，不能重复加回复数。
      if (!fresh.length) return
      const all = loadAll()
      const prev = all[tid]
      markSeen(
        tid,
        Math.max(0, ...fresh.map((p) => p.ts || 0)),
        prev && prev.r != null ? prev.r + fresh.length : null,
      )
    })

    /* ── 上色侧：列表页把看过的条目变灰 ── */
    const DIM = { 轻: 0.7, 中: 0.55, 重: 0.35 }

    /** 当前列表行是否已经读到记录中的回复数；没有回复数时退回楼层时间水位。 */
    function isReadAt(rec, it) {
      if (it.replies != null && rec.r != null) return it.replies <= rec.r
      if (it.lastActiveTs != null && rec.w != null) return it.lastActiveTs <= rec.w
      return true
    }

    function clearNativeUnread(li) {
      li.querySelectorAll('a.unread-topic-notice').forEach((node) => node.remove())
      // 实时流的短时高亮也是「新评论」提示；用户已经读到当前水位后一起清掉。
      li.classList.remove('lsb-live-bumped')
    }

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
      if (isReadAt(rec, it)) clearNativeUnread(li)
    }

    function paintTopic(id) {
      if (id == null) return
      for (const li of document.querySelectorAll(api.sel?.listItems || 'ul.post-list > li.post-item:not(.post-entry):not(.topic-collections-collection-row)')) {
        const it = api.parse.listItem(li)
        if (it?.id === Number(id)) paint(li)
      }
    }

    function paintAll() {
      for (const li of document.querySelectorAll(api.sel?.listItems || 'ul.post-list > li.post-item:not(.post-entry):not(.topic-collections-collection-row)')) {
        paint(li)
      }
    }

    // 现有 + 无限滚动新增的条目各回调一次（幂等）
    api.dom.each(api.sel?.listItems || 'ul.post-list > li.post-item:not(.post-entry):not(.topic-collections-collection-row)', paint)
    // 软导航后 DOM 可能被整段换掉：记账 + 全量重涂
    api.on('route:changed', () => {
      markOpenTopic()
      setTimeout(paintAll, 50)
    })

    // 实时流更新了旧帖行的评论数后重新判断：用户已读到该水位时，清除缓存行里的旧提示。
    api.on('live-feed:list-row-updated', ({ id } = {}) => paintTopic(id))

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
        info.textContent = `本地已记录 ${total} 帖。已读到当前评论数时清理站点未读提示；置灰只改外观。`
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
    version: '1.0.4',
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
    async function doCheckin(skipConfirm = false, { detailed = false } = {}) {
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
      let res
      try {
        res = await api.net.raw(formInfo.action, {
          method: 'POST',
          body: fd,
          headers: { 'x-requested-with': 'XMLHttpRequest' },
        })
      } catch {
        const result = { done: false, reason: 'unknown', outcome: 'unknown', status: 0, message: '签到请求未收到可判定结果' }
        api.ui.toast('签到结果未知，请检查站点状态', { type: 'error' })
        return result
      }
      const outcome = api.net.classifyWrite(res, { actionPath: formInfo.action })
      if (outcome.outcome !== 'success') {
        const result = {
          done: false,
          reason: outcome.outcome === 'failure' ? `http-${outcome.status || 'error'}` : 'unknown',
          outcome: outcome.outcome,
          status: outcome.status,
          ...(outcome.message ? { message: outcome.message } : {}),
        }
        api.ui.toast('签到失败 HTTP ' + res.status, { type: 'error' })
        return result
      }
      status = 'ok'
      setDay(today(), 'ok')
      api.ui.toast('签到完成', { type: 'success' })
      return detailed ? { done: true, outcome: 'success', status: outcome.status, ...(outcome.message ? { message: outcome.message } : {}) } : true
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

    api.handle('checkin-calendar:ai-checkin', async () => {
      if (!formInfo) await probe(true)
      const csrf = formInfo?.fields?.filter((field) => field.name === '_csrf') || []
      let action
      try {
        action = new URL(formInfo?.action || '', location.href)
      } catch {
        throw new Error('签到表单地址无效，已停止提交')
      }
      if (action.origin !== location.origin || !/checkin/i.test(action.pathname) || csrf.length !== 1 || !String(csrf[0].value || '').trim()) {
        throw new Error('签到表单或 CSRF 校验失败，已停止提交')
      }
      return doCheckin(false, { detailed: true })
    })

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
    version: '2.0.33',
    description: '旧三段式与 iOS 27 单画布双模式，保留正文排版与站内安全链',
    author: 'you',
    requires: { base: '^0.2.3' },
    permissions: ['ui', 'storage', 'events', 'read'],
    config: {
      shell: { type: 'switch', label: '氢壳', desc: '同时控制旧三段式和 iOS 27 单画布；关闭后恢复站点原生页面。', default: true },
      uiMode: {
        type: 'select',
        label: '界面模式',
        default: 'legacy',
        options: [
          { value: 'legacy', label: '旧三段式' },
          { value: 'ios27', label: 'iOS 27 单画布' },
        ],
      },
      topicSpa: { type: 'switch', label: '帖子页同文档软跳', desc: '默认开启；可关闭以恢复站点原生帖子生命周期与交互。', default: true },
      glass: { type: 'switch', label: '玻璃材料', default: false },
      glassOpacity: { type: 'number', label: '玻璃透明度（0.35–1）', default: 0.72 },
      glassBlur: { type: 'number', label: '玻璃模糊（0–32px）', default: 18 },
      baseFontSize: { type: 'number', label: '基础字号（12–32px）', default: 14 },
      fontFamily: { type: 'text', label: '界面字体', default: '' },
      fontUrl: { type: 'text', label: '字体 URL（HTTPS）', default: '' },
      backgroundVideoEnabled: { type: 'switch', label: '启用视频背景', default: false },
      backgroundVideoUrl: { type: 'text', label: '视频 URL（HTTPS）', default: '' },
      backgroundVideoLocalKey: { type: 'text', label: '本地视频资源键', default: '' },
      backgroundImageUrl: { type: 'text', label: '静态图片 URL（HTTPS）', default: '' },
      backgroundImageLocalKey: { type: 'text', label: '本地图片资源键', default: '' },
      fontLocalKey: { type: 'text', label: '本地字体资源键', default: '' },
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

  /* M17 单一画布状态契约：保持纯函数，DOM 与存储适配留在 setup。 */
  const CANVAS_STATE_VERSION = 2
  const CANVAS_STATE_KEY = 'canvas-state:v2'
  const CANVAS_WIDTH_CLASSES = ['wide', 'mid', 'narrow']
  const CLOUDFLARE_CHALLENGE_ATTR = 'data-lsb-cloudflare-challenge'
  const SPA_ROUTE_PENDING_CLASS = 'lsb-canvas-route-pending'
  const SPA_ROUTE_COMMITTED_EVENT = 'lsb:route-committed'
  const CLOUDFLARE_CHALLENGE_MARKERS = '#challenge-stage, #challenge-form, #challenge-running, #cf-challenge-running, .cf-browser-verification, [data-cf-challenge]'
  const CLOUDFLARE_CHALLENGE_TITLE_COPY = /(?:just a moment|attention required|checking your browser|checking if (?:the )?site connection is secure)/i
  const CLOUDFLARE_CHALLENGE_BODY_COPY = /(?:checking your browser|verify (?:that )?you are human|enable javascript and cookies to continue|performing (?:a )?security (?:check|verification)|complete (?:the )?security check|请完成.{0,12}验证|请进行.{0,12}验证|正在验证|人机验证)/i
  const CLOUDFLARE_CHALLENGE_COPY_SELECTOR = 'h1, h2, h3, p, [role="heading"], #challenge-error-text, #challenge-body-text, [data-cf-challenge-message]'
  const CANVAS_DEFAULT_APPEARANCE = Object.freeze({
    background: 'static', backgroundVideoUrl: '', backgroundVideoLocalKey: '', backgroundImageUrl: '', backgroundImageLocalKey: '',
    opacity: 0.72, blur: 18, fontFamily: '', fontUrl: '', fontLocalKey: '',
    fontSize: 14, textColor: '', panelColor: '', accentColor: '', radius: 16,
    motion: 'auto', transparency: 'auto',
  })
  const CANVAS_DEFAULT_SURFACES = Object.freeze({
    siteCard: { width: 360, height: 560 }, evidenceCard: { width: 420, height: 320 },
  })
  const CANVAS_AI_MARKUP = { capsule: '', tool: '', query: '', card: '' }

  function isCloudflareChallengeDocument(doc) {
    if (!doc?.querySelector) return false
    if (doc.documentElement?.getAttribute(CLOUDFLARE_CHALLENGE_ATTR) === 'true') return true
    if (!doc.querySelector(CLOUDFLARE_CHALLENGE_MARKERS)) return false
    if (CLOUDFLARE_CHALLENGE_TITLE_COPY.test(String(doc.title || ''))) return true
    const view = doc.defaultView
    for (const node of doc.querySelectorAll(CLOUDFLARE_CHALLENGE_COPY_SELECTOR)) {
      if (!CLOUDFLARE_CHALLENGE_BODY_COPY.test(node.textContent || '')) continue
      let visible = true
      for (let current = node; current?.nodeType === 1; current = current.parentElement) {
        if (current.hidden || current.getAttribute('aria-hidden') === 'true') {
          visible = false
          break
        }
        const style = view?.getComputedStyle?.(current)
        if (style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0')) {
          visible = false
          break
        }
        if (current === doc.body || !current.parentElement) break
      }
      if (visible) return true
    }
    return false
  }

  function canvasFinite(value, fallback = 0) {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }

  function canvasCopy(value) {
    if (value === null || typeof value !== 'object') return value
    if (Array.isArray(value)) return value.map(canvasCopy)
    const out = {}
    for (const [key, item] of Object.entries(value)) out[key] = canvasCopy(item)
    return out
  }

  function canvasMerge(left, right) {
    const a = left && typeof left === 'object' ? left : {}
    const b = right && typeof right === 'object' ? right : {}
    const out = canvasCopy(a)
    for (const [key, value] of Object.entries(b)) {
      if (value && typeof value === 'object' && !Array.isArray(value) && a[key] && typeof a[key] === 'object' && !Array.isArray(a[key])) out[key] = canvasMerge(a[key], value)
      else out[key] = canvasCopy(value)
    }
    return out
  }

  function widthClass(width) {
    const n = canvasFinite(width, 0)
    return n >= 1100 ? 'wide' : n >= 700 ? 'mid' : 'narrow'
  }

  function siteKeyFromLocation(locationLike) {
    try {
      const url = locationLike instanceof URL
        ? locationLike
        : new URL(String(locationLike?.href || locationLike || ''), 'https://linux.sb/')
      return url.origin
    } catch {
      return ''
    }
  }

  function defaultCanvasState() {
    return {
      version: CANVAS_STATE_VERSION,
      enabled: true,
      global: {
        preset: 'balanced-glass',
        appearance: canvasCopy(CANVAS_DEFAULT_APPEARANCE),
        surfaceDefaults: canvasCopy(CANVAS_DEFAULT_SURFACES),
        layout: { wide: {}, mid: {}, narrow: {} },
      },
      sites: {},
      legacyLayoutSnapshot: null,
    }
  }

  function mergeCanvasState(globalState, siteOverride = {}) {
    const source = globalState && typeof globalState === 'object' ? globalState : {}
    const base = source.global && typeof source.global === 'object' ? source.global : source
    const overrideSource = siteOverride && typeof siteOverride === 'object' ? siteOverride : {}
    const override = overrideSource.global && typeof overrideSource.global === 'object' ? overrideSource.global : overrideSource
    const merged = canvasMerge(base, override)
    if (!merged.preset) merged.preset = 'balanced-glass'
    merged.appearance = canvasMerge(CANVAS_DEFAULT_APPEARANCE, merged.appearance)
    merged.surfaceDefaults = canvasMerge(CANVAS_DEFAULT_SURFACES, merged.surfaceDefaults)
    merged.layout = canvasMerge({ wide: {}, mid: {}, narrow: {} }, merged.layout)
    return merged
  }

  function clampSurfaceRect(rect = {}, viewport = {}, minimum = {}) {
    const vw = Math.max(1, Math.round(canvasFinite(viewport.width, 1)))
    const vh = Math.max(1, Math.round(canvasFinite(viewport.height, 1)))
    const minWidth = Math.max(1, Math.round(canvasFinite(minimum.width, 240)))
    const minHeight = Math.max(1, Math.round(canvasFinite(minimum.height, 160)))
    const width = Math.min(vw, Math.max(minWidth, Math.round(canvasFinite(rect.width, minWidth))))
    const height = Math.min(vh, Math.max(minHeight, Math.round(canvasFinite(rect.height, minHeight))))
    const x = Math.min(Math.max(0, Math.round(canvasFinite(rect.x, 0))), Math.max(0, vw - width))
    const y = Math.min(Math.max(0, Math.round(canvasFinite(rect.y, 0))), Math.max(0, vh - height))
    return { x, y, width, height }
  }

  function migrateLegacySkinState(rawConfig = {}, mediaMeta = {}) {
    const raw = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
    const next = defaultCanvasState()
    next.enabled = raw.shell !== false
    const appearance = {}
    for (const [source, target] of [['backgroundVideoUrl', 'backgroundVideoUrl'], ['backgroundVideoLocalKey', 'backgroundVideoLocalKey'], ['backgroundImageUrl', 'backgroundImageUrl'], ['backgroundImageLocalKey', 'backgroundImageLocalKey'], ['fontUrl', 'fontUrl'], ['fontLocalKey', 'fontLocalKey'], ['fontFamily', 'fontFamily'], ['textColor', 'textColor'], ['panelColor', 'panelColor'], ['accentColor', 'accentColor']]) {
      if (raw[source]) appearance[target] = String(raw[source])
    }
    if (raw.baseFontSize != null) appearance.fontSize = canvasFinite(raw.baseFontSize, 14)
    if (raw.glassOpacity != null) appearance.opacity = canvasFinite(raw.glassOpacity, 0.72)
    if (raw.glassBlur != null) appearance.blur = canvasFinite(raw.glassBlur, 18)
    if (raw.backgroundVideoEnabled === true) appearance.background = 'video'
    else if (raw.backgroundImageUrl || raw.backgroundImageLocalKey) appearance.background = 'image'
    if (Object.keys(appearance).length) next.global.appearance = canvasMerge(next.global.appearance, appearance)
    if (mediaMeta && typeof mediaMeta === 'object') next.global.appearance = canvasMerge(next.global.appearance, {
      ...(mediaMeta.videoId || mediaMeta.videoKey ? { backgroundVideoLocalKey: mediaMeta.videoId || mediaMeta.videoKey } : {}),
      ...(mediaMeta.fontId || mediaMeta.fontKey ? { fontLocalKey: mediaMeta.fontId || mediaMeta.fontKey } : {}),
    })
    next.legacyLayoutSnapshot = {
      version: 1, shell: raw.shell, layoutMode: raw.layoutMode, header: raw.header, rail: raw.rail, aside: raw.aside,
      wallpaperUrl: raw.wallpaperUrl, backgroundVideoUrl: raw.backgroundVideoUrl, backgroundVideoLocalKey: raw.backgroundVideoLocalKey,
      backgroundImageUrl: raw.backgroundImageUrl, backgroundImageLocalKey: raw.backgroundImageLocalKey,
      fontFamily: raw.fontFamily, fontUrl: raw.fontUrl, fontLocalKey: raw.fontLocalKey, glassOpacity: raw.glassOpacity, glassBlur: raw.glassBlur,
    }
    return next
  }

  function resolveSurfaceMode(widthValue, surfaceKind = '') {
    const bucket = CANVAS_WIDTH_CLASSES.includes(widthValue) ? widthValue : 'wide'
    const kind = String(surfaceKind || '')
    if (kind === 'top-status' || kind === 'tool-capsule') return 'fixed'
    if (bucket === 'wide') {
      if (kind === 'site-card') return 'rail'
      return kind.endsWith('sheet') ? 'sheet' : 'floating'
    }
    return bucket === 'mid' ? 'sheet' : 'fullscreen'
  }

  // ═══════════════════════════════════════════════════════════
  // 章节索引（本文件 8205 行，全仓最大，改动前先定位章节）：
  //   A: 画布状态 — defaultCanvasState / mergeCanvasState / clampSurfaceRect / migrateLegacySkinState / read/saveCanvasState
  //   B: 工具与壳样式 — shellCss / canvasCss / css / applyShellTokens / 媒体/字体/视频
  //   C: 原生结构接管 — restyle / markNative / nativeHeaders/Sidebars / asideWide / uiMode resize
  //   D: 氢壳视图与窗口 — aside/shellAside* / window/shellWindow* / canvas 状态持久化
  //   E: 插件特性与工具菜单 — collectBoards / renderPluginFeatureEntries / collectTools
  //   F: 导航与搜索 — pagePath / locationText / shellSearchHost / adoptSearch
  // 拆分建议：按 A–F 提 plugins/skin/*.js 子模块，由 build-suite.mjs 聚合（复用 skin 的 @LSB_DEV_AI_START 机制）。
  // ═══════════════════════════════════════════════════════════
  function setup(api) {
    let cfg = api.config()

    // ── A: 配置与画布状态（effectiveUiMode/canvasViewport/readSaveCanvasState） ──
    function effectiveUiMode() {
      return cfg?.uiMode === 'ios27' ? 'ios27' : 'legacy'
    }

    const SEARCH_FORM_SELECTOR = 'form.search-form, form.meilisearch-search-top-form, form[role="search"][aria-label="站内搜索"]'
    const TOP_SEARCH_FORM_SELECTOR = 'body > .top form.search-form, body > .top form.meilisearch-search-top-form, body > .top form[role="search"][aria-label="站内搜索"]'
    const topicSpaMigrationKey = 'topicSpaNewWorldDefaultMigrationV1'
    try {
      if (api.store.get(topicSpaMigrationKey) !== true) {
        api.saveConfig({ topicSpa: true })
        cfg = { ...cfg, topicSpa: true }
        api.store.set(topicSpaMigrationKey, true)
      }
    } catch {
      // Keep the resolved config when migration storage is unavailable.
    }
    let canvasState = null
    let canvasEffective = null
    let canvasSiteKey = siteKeyFromLocation(location)
    let canvasWidthClass = widthClass(window.innerWidth || document.documentElement?.clientWidth || 0)
    let canvasStateMigrated = false

    function canvasViewport() {
      return {
        width: Math.max(1, Number(window.innerWidth || document.documentElement?.clientWidth || 1)),
        height: Math.max(1, Number(window.innerHeight || document.documentElement?.clientHeight || 1)),
      }
    }

    function readCanvasState() {
      let stored = null
      try { stored = api.store.get(CANVAS_STATE_KEY, null) } catch { stored = null }
      if (!stored || typeof stored !== 'object' || Number(stored.version) !== CANVAS_STATE_VERSION) {
        canvasState = migrateLegacySkinState(cfg)
        canvasStateMigrated = true
        try { api.store.set(CANVAS_STATE_KEY, canvasState) } catch { /* storage may be unavailable */ }
      } else {
        const base = defaultCanvasState()
        canvasState = canvasMerge(base, stored)
        canvasState.version = CANVAS_STATE_VERSION
        canvasState.sites = stored.sites && typeof stored.sites === 'object' ? canvasCopy(stored.sites) : {}
      }
      canvasSiteKey = siteKeyFromLocation(location)
      canvasWidthClass = widthClass(canvasViewport().width)
      canvasEffective = mergeCanvasState(canvasState, canvasState.sites?.[canvasSiteKey] || {})
      return canvasEffective
    }

    function saveCanvasState() {
      if (!canvasState) return
      try { api.store.set(CANVAS_STATE_KEY, canvasCopy(canvasState)) } catch { /* storage failure is non-fatal */ }
    }

    function canvasDebugSnapshot() {
      const host = document.getElementById('lsb-shell-surfaces')
      return {
        enabled: canvasState?.enabled !== false && cfg.shell !== false,
        version: CANVAS_STATE_VERSION,
        siteKey: canvasSiteKey,
        widthClass: canvasWidthClass,
        preset: canvasEffective?.preset || 'balanced-glass',
        legacyLayoutSnapshot: canvasCopy(canvasState?.legacyLayoutSnapshot || null),
        surfaces: [...(host?.querySelectorAll?.('[data-surface]') || [])]
          .filter((node) => !node.hidden && !['top-status', 'tool-capsule'].includes(node.getAttribute('data-surface')))
          .map((node) => String(node.getAttribute('data-surface') || ''))
          .filter(Boolean),
        user: {
          enabled: canvasPageType() === 'user',
          selfProfile: {
            mounted: !!document.querySelector('[data-canvas-profile-host] .lsb-canvas-self-user-card'),
            expanded: document.querySelector('[data-canvas-profile-host]')?.dataset.expanded === 'true',
            locked: document.querySelector('[data-canvas-profile-host]')?.dataset.locked === 'true',
          },
          profile: {
            scrollMode: document.querySelector('[data-lsb-canvas-profile]')?.dataset.scrollMode || 'full',
            expanded: document.querySelector('[data-lsb-canvas-profile]')?.dataset.expanded === 'true',
            mounted: !!document.querySelector('[data-lsb-canvas-profile] .sidebar-card.user-card'),
          },
          listMounted: !!document.querySelector('[data-lsb-canvas-list]'),
          topLinks: [...(host?.querySelectorAll?.('[data-canvas-status-links] a, [data-canvas-pinned-links] a') || [])].map((node) => String(node.textContent || '').trim()).filter(Boolean),
          gap: 12,
        },
      }
    }

    readCanvasState()
    const shellLayoutApi = api.ui.shellLayout || null
    const shellStyleApi = api.ui.shellStyle || null
    const hasWindowApi = typeof api.ui.shellWindowController === 'function'
    let contentHome = null
    let contentOutlet = null
    let contentScroller = null
    let scrollBridge = null
    const nativeSidebarHomes = new Map()
    let shellWindowLayout = null
    let shellWindowRegistry = []
    let shellLayoutKey = ''
    let shellLayoutSaveTimer = 0
    const shellTokenProps = new Set()
    let mediaDbPromise = null
    let mediaGeneration = 0
    let backgroundVideo = null
    let backgroundVideoObjectUrl = ''
    let backgroundImage = null
    let backgroundImageObjectUrl = ''
    let loadedFontFace = null
    let loadedFontObjectUrl = ''
    let backgroundSpecKey = ''
    let fontSpecKey = ''
    let spaRouteChromeSerial = 0
    let mountedUiMode = null
    let pendingUiModeScroll = null
    let cloudflareChallengeObserver = null
    let uiModeResizeBound = false
    let uiModeWideSnapshot = null
    let canvasShell = null
    let canvasSurfaceHost = null
    let canvasActiveSheet = ''
    let canvasFocusReturn = null
    let canvasSearchOutsideHandler = null
    let canvasZIndex = 0
    let canvasSelectionBound = false
    let canvasSelectionHandler = null
    let canvasSelectionPost = null
    let canvasSelectionText = ''
    let canvasSelectionDismissTimer = 0
    let canvasScrollBound = false
    let canvasScrollLast = 0
    let canvasScrollRaf = 0
    let canvasScrollHandler = null
    let canvasResizeHandler = null
    let canvasDragState = null
    let canvasDragRaf = 0
    let canvasProfileExpanded = false
    let canvasProfileScrollMode = 'full'
    let canvasSelfProfileHome = null
    let canvasSelfProfileHost = null
    let canvasSelfProfileLocked = false
    let canvasListSurface = null
    let canvasListHome = null
    let canvasStatusObserver = null
    let canvasScrollTarget = null
    const canvasStatusLinkHomes = new Map()
    let windowInteractionBound = false
    let windowInteractionState = null
    let windowInteractionRaf = 0
    let responsiveBound = false
    let responsiveHandler = null
    let narrowActiveWindow = 'content'
    const LAYOUT_MIGRATION_KEY = 'layoutMigrationVersion'
    const LAYOUT_MIGRATION_VERSION = 1
    const LAYOUT_SAVE_DEBOUNCE = 150
    const offWindowController = hasWindowApi
      ? api.ui.shellWindowController((action, value) => {
        if (action === 'focus') return focusShellWindow(value)
        if (action === 'arrange') return arrangeShellWindows()
        if (action === 'reset') return resetShellWindow(value)
        if (action === 'layout') return shellWindowLayout ? structuredCloneSafe(shellWindowLayout) : null
        return null
      })
      : () => {}
    const offScrollRoot = typeof api.ui.shellScrollRootController === 'function'
      ? api.ui.shellScrollRootController(() => contentScroller)
      : () => {}
    const offAsideController = typeof api.ui.shellAsideController === 'function'
      ? api.ui.shellAsideController((id) => {
        const aside = document.querySelector('#lsb-shell-aside')
        return asideSetActive(id, aside, true)
      })
      : () => {}
    let searchHome = null
    let userCardHome = null
    let canvasProfileSlot = null
    let canvasProfileOutlet = null
    const canvasSiteSidebarHomes = new Map()
    const canvasPersistentSiteCards = new Map()
    let canvasSiteSidebarHost = null
    let canvasSiteStatusHost = null
    let canvasSiteStatusLocked = false
    let canvasSidebarObserver = null
    const extrasHomes = new Map()
    const asideHomes = new Map()
    const asidePersistentCards = new Map()
    const asideViews = new Map()
    const externalWindowViews = new Map()
    const ASIDE_ACTIVE_KEY = 'aside-active'
    const storedAsideId = api.store.get(ASIDE_ACTIVE_KEY, 'site')
    let asidePreferredId = storedAsideId === 'site' || /^[a-z][a-z0-9-]{0,63}$/.test(String(storedAsideId || ''))
      ? String(storedAsideId || 'site')
      : 'site'
    let asideActiveId = 'site'
    let asideResizeBound = false
    let themeToggleHome = null
    let colorSchemeHome = null
    let colorSchemeModalHome = null
    let onlineObs = null
    let onlineAvatarObs = null
    let onlineAvatarTimer = 0
    let onlineUserRefreshTimer = 0
    let onlineUserRefreshInflight = null
    let onlineUserRefreshPending = false
    let onlineUserRefreshAfterInflight = false
    let onlineUserRefreshVisibilityBound = false
    let onlineUserRefreshGeneration = 0
    let onlineUserLastSyncAt = 0
    let extrasObs = null
    let timelineRaf = 0
    let refreshTimer = 0
    let windowListening = false
    let spaSerial = 0
    let spaFilledSerial = 0
    let nativeThreadObserver = null
    let nativeThreadList = null
    let nativeThreadApplyTimer = 0
    let nativeThreadLifecycleBound = false
    const nativeReplyParentByForm = new WeakMap()
    let nativeCaptchaObserver = null
    let nativeCaptchaApplyTimer = 0
    let nativeCaptchaEpoch = 0
    const nativeCaptchaSolvers = new WeakMap()
    let spaAbortController = null
    let toolsCache = null
    let spaProgressTimer = 0
    let spaIgnorePop = false
    let spaHistoryIndex = 0
    let spaHistoryRollbackIndex = null
    let spaBound = false
    let homeInf = null
    const homeInfRecords = new WeakMap()
    let spaViewKey = ''
    const VIEW_CACHE_MAX = 5
    const HOME_STASH_REFRESH_MS = 30000
    const ONLINE_USER_REFRESH_MS = 30000
    const viewCache = new Map()
    let homeStashTimer = 0
    let homeStashInflight = null
    let homeStashGen = 0
    let homeStashPending = false

    const BUILTIN_WINDOWS = Object.freeze([
      { id: 'nav', label: '导航', order: 10, min: { width: 200, height: 160 }, defaultRect: { width: 240, height: 640 } },
      { id: 'content', label: '正文', order: 20, min: { width: 320, height: 240 }, defaultRect: { width: 720, height: 640 } },
      { id: 'site', label: '站点', order: 30, min: { width: 240, height: 160 }, defaultRect: { width: 280, height: 640 } },
    ])

    /* ── 共存检测：色彩主题已由其它脚本负责，本模块只做排版层，天然无冲突。
       若未来加入色彩子项，须在此让位。 ── */
    const themesPresent = !!document.querySelector('style[data-themes-plugin]')

    const FONT_SANS =
      "system-ui,-apple-system,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans SC',sans-serif"
    const FONT_MONO =
      "ui-monospace,SFMono-Regular,'Cascadia Code',Consolas,'JetBrains Mono','Noto Sans Mono CJK SC',monospace"

    // ── B: 工具与样式（esc/shellCss/canvasCss/css/applyShellTokens） ──
    function esc(s) {
      return String(s ?? '').replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
      )
    }

    function structuredCloneSafe(value) {
      try {
        if (typeof structuredClone === 'function') return structuredClone(value)
      } catch {
        /* fall through to JSON for the small layout record */
      }
      try {
        return JSON.parse(JSON.stringify(value))
      } catch {
        return value
      }
    }

    // · B1 shellCss: 旧三段式壳（固定顶栏/左轨/右栏变量与栅格） ──
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
        .lsb-shell-rail-scroll{flex:1;min-height:0;overflow:hidden;padding:56px 12px 12px;display:flex;flex-direction:column}
        .lsb-shell-rail-scroll [data-lsb-shell-section="home"]{flex:0 0 auto}
        .lsb-shell-rail-scroll [data-lsb-shell-section="boards"]{flex:1 1 auto;min-height:0;overflow:auto}
        .lsb-shell-rail-scroll [data-lsb-shell-section="tools"]{flex:0 0 auto}
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
        html.lsb-skin-shell-on #color-scheme-modal{z-index:8020!important}
        html.lsb-skin-shell-on .lsb-shell-theme-modal{z-index:8020!important}
        .lsb-shell-theme .color-scheme-top-link{
          display:inline-flex;width:30px;height:30px;align-items:center;justify-content:center;
          grid-area:auto;justify-self:auto;flex:0 0 30px;
          color:var(--text-muted,#888);text-decoration:none;
        }
        .lsb-shell-theme .color-scheme-top-link svg{width:17px;height:17px;display:block}
        #lsb-shell-aside{
          display:none;flex-direction:column;position:fixed;top:var(--lsb-shell-header);right:0;bottom:0;
          width:var(--lsb-shell-aside);z-index:7999;overflow:hidden;padding:0;
          background:var(--bg,#f4f5f7);color:var(--text,#222);
          border-left:1px solid var(--line-soft,#e8e8e8);
          font-family:${FONT_SANS};
        }
        #lsb-shell-aside-tabs{
          display:flex;align-items:center;gap:4px;min-height:40px;padding:6px 10px;
          border-bottom:1px solid var(--line-soft,#e8e8e8);background:color-mix(in srgb,var(--panel,#fff) 72%,transparent);
        }
        #lsb-shell-aside-tabs[hidden]{display:none!important}
        #lsb-shell-aside-tabs [data-lsb-shell-aside-tab]{
          flex:1 1 0;min-width:0;height:28px;padding:0 8px;border:0;border-radius:var(--lsb-radius-sm);
          background:transparent;color:var(--text-muted,#888);font:inherit;font-size:12px;cursor:pointer;
        }
        #lsb-shell-aside-tabs [data-lsb-shell-aside-tab][aria-selected="true"]{
          background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);font-weight:600;
        }
        .lsb-shell-aside-panes{flex:1 1 auto;height:auto;min-height:0}
        [data-lsb-shell-aside-pane]{height:100%;min-height:0;box-sizing:border-box;overflow:auto;padding:12px 10px 16px}
        [data-lsb-shell-aside-pane][hidden]{display:none!important}
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
        /* legacy 首页宽屏把纵向滚动交给中间面板，页面根和右栏保持固定。首页由 JS 明确标记，不能用 .home-shell 判断：首页和帖子页共用这个容器。 */
        @media(min-width:900px){
          html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode){
            box-sizing:border-box!important;height:100vh!important;max-height:100vh!important;overflow:hidden!important;
          }
          html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body{
            box-sizing:border-box!important;display:flex!important;flex-direction:column!important;
            height:calc(100vh - var(--lsb-shell-header))!important;
            max-height:calc(100vh - var(--lsb-shell-header))!important;
            min-height:0!important;margin:0!important;overflow:hidden!important;
          }
          html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body > main.wrap{
            box-sizing:border-box!important;display:flex!important;flex:1 1 auto!important;flex-direction:column!important;
            width:auto!important;max-width:none!important;margin-left:0!important;margin-right:0!important;padding-right:0!important;
            height:100%!important;max-height:100%!important;
            min-width:0!important;min-height:0!important;overflow:hidden!important;
          }
          html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body > main.wrap .home-shell,
          html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body > main.wrap .home-shell > .forum-layout.forum-layout-has-sidebar,
          html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body > main.wrap .home-shell > .forum-layout.forum-layout-has-sidebar > .forum-main{
            box-sizing:border-box!important;display:flex!important;flex:1 1 auto!important;flex-direction:column!important;
            width:100%!important;max-width:none!important;min-width:0!important;min-height:0!important;
          }
          html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body > main.wrap .home-shell{
            padding-right:0!important;
          }
          html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body > main.wrap .home-shell > .forum-layout.forum-layout-has-sidebar > .forum-main > .main-panel{
            box-sizing:border-box!important;display:flex!important;flex:1 1 auto!important;flex-direction:column!important;
            width:100%!important;max-width:none!important;min-width:0!important;min-height:0!important;
            overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;scrollbar-gutter:stable;
          }
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
          html.lsb-skin-shell-on .lsb-native-sidebar-hidden,
          html.lsb-skin-shell-on .lsb-native-left-hidden{display:none!important}
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
          html.lsb-skin-shell-on #lsb-shell-aside{display:flex}
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
          position:fixed;top:0;left:0;right:0;z-index:8002;height:3px;
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
        [data-lsb-route-content-enter]{animation:lsb-route-content-in 180ms ease both}
        @keyframes lsb-route-content-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        #lsb-route-announcer{
          position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
          clip-path:inset(50%);white-space:nowrap;border:0;
        }
        @media(prefers-reduced-motion:reduce){[data-lsb-route-content-enter]{animation:none!important;transform:none!important}}
        html.lsb-canvas-reduced-motion [data-lsb-route-content-enter]{animation:none!important;transform:none!important}
        /* H2 窗口工作区：默认令牌仍继承站点主题，几何由 skin 的 layout controller 写入。 */
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-workspace{
          position:fixed;top:var(--lsb-shell-header);left:0;right:0;bottom:0;
          overflow:hidden;pointer-events:none;
        }
        /* 窗口模式覆盖 700–899px 的媒体查询空档；窗口已挂载就必须可见。 */
        html.lsb-skin-shell-windowed #lsb-shell[data-lsb-shell-mode="windowed"]{display:block}
        html.lsb-skin-shell-windowed .lsb-native-header-hidden,
        html.lsb-skin-shell-windowed .lsb-native-sidebar-hidden,
        html.lsb-skin-shell-windowed .lsb-native-left-hidden,
        html.lsb-skin-shell-windowed .forum-more-region{display:none!important}
        #lsb-shell-workspace > [data-lsb-shell-video]{
          position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
          z-index:0;pointer-events:none;opacity:0;transition:opacity 180ms ease;
        }
        html.lsb-skin-video-on #lsb-shell-workspace > [data-lsb-shell-video]{opacity:1}
        #lsb-shell-workspace > [data-lsb-shell-image]{
          position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
          z-index:0;pointer-events:none;opacity:0;transition:opacity 180ms ease;
        }
        html.lsb-skin-image-on #lsb-shell-workspace > [data-lsb-shell-image]{opacity:1}
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window{
          position:absolute;display:flex;flex-direction:column;min-width:0;min-height:0;
          box-sizing:border-box;overflow:hidden;pointer-events:auto;
          border:1px solid var(--line-soft,#e8e8e8);border-radius:var(--lsb-radius-lg);
          background:var(--panel,#fff);color:var(--text,#222);
          box-shadow:0 12px 30px color-mix(in srgb,var(--text,#222) 12%,transparent);
          z-index:1;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-interacting="drag"]{
          will-change:transform;contain:layout paint;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-interacting="resize"]{
          will-change:left,top,width,height;contain:layout paint;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[hidden]{display:none!important}
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-external="true"][data-lsb-shell-open="false"]{display:none!important}
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-bar{
          display:flex;align-items:center;gap:6px;min-height:32px;flex:0 0 32px;
          padding:0 8px;border-bottom:1px solid var(--line-soft,#e8e8e8);
          background:color-mix(in srgb,var(--panel,#fff) 82%,transparent);
          color:var(--text,#222);user-select:none;touch-action:none;position:relative;z-index:5;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-title{
          min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
          font:600 12px/1 ${FONT_SANS};
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-drag{
          flex:1;min-width:16px;height:100%;cursor:grab;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-drag:active{cursor:grabbing}
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-action{
          flex:0 0 28px;width:28px;height:28px;padding:0;border:0;border-radius:6px;
          background:transparent;color:var(--text-muted,#888);cursor:pointer;font:inherit;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-action:hover,
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-action:focus-visible{
          background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);outline:none;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window:focus-visible{
          outline:2px solid var(--brand,#5eaaa0);outline-offset:2px;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-body{
          flex:1 1 auto;min-width:0;min-height:0;overflow:auto;overscroll-behavior:contain;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-rail > .lsb-shell-window-body,
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-aside > .lsb-shell-window-body{
          display:flex;flex-direction:column;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-rail,
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-aside,
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-window-content{
          top:0;right:auto;bottom:auto;left:auto;width:auto;height:auto;
          position:absolute;z-index:auto;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-rail{padding:0;border-right:0}
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-rail .lsb-shell-rail-scroll{padding-top:12px}
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-aside{display:flex;padding:0;border-left:0}
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-window-content main.wrap{
          width:auto!important;max-width:none!important;margin:0!important;padding:12px!important;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-content-body{
          flex:1 1 auto;min-width:0;min-height:0;overflow:auto;overscroll-behavior:contain;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge]{
          position:absolute;z-index:4;touch-action:none;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="e"],
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="w"]{
          top:12px;bottom:12px;width:10px;cursor:ew-resize;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="e"]{right:-5px}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="w"]{left:-5px}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="s"],
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="n"]{
          left:12px;right:12px;height:10px;cursor:ns-resize;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="s"]{bottom:-5px}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="n"]{top:-5px}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="e"],
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="w"]{
          width:10px;top:12px;bottom:12px;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="e"]{right:-5px}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="w"]{left:-5px}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="s"],
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="n"]{
          height:10px;left:12px;right:12px;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="s"]{bottom:-5px}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="n"]{top:32px}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="ne"],
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="nw"],
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="se"],
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="sw"]{
          width:14px;height:14px;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="ne"]{right:-5px;top:32px;cursor:nesw-resize}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="nw"]{left:-5px;top:32px;cursor:nwse-resize}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="se"]{right:-5px;bottom:-5px;cursor:nwse-resize}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="sw"]{left:-5px;bottom:-5px;cursor:nesw-resize}
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-switcher{display:none}
        @media(max-width:699px){
          html.lsb-skin-shell-on{padding:0!important;overflow:hidden}
          html.lsb-skin-shell-on body{overflow:hidden}
          html.lsb-skin-shell-on #lsb-shell{display:block}
          html.lsb-skin-shell-on .lsb-native-header-hidden,
          html.lsb-skin-shell-on .forum-more-region{display:none!important}
          html.lsb-skin-shell-on .lsb-native-sidebar-hidden,
          html.lsb-skin-shell-on .lsb-native-left-hidden{display:none!important}
          #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-workspace{top:var(--lsb-shell-header)}
          #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-switcher{
            display:flex;position:fixed;top:var(--lsb-shell-header);left:0;right:0;height:36px;
            z-index:8010;gap:4px;padding:4px;background:var(--panel,#fff);overflow:auto;
          }
          #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-switcher [role="tab"]{
            flex:1 0 auto;border:0;border-radius:6px;background:transparent;color:var(--text-muted,#888);
            padding:0 10px;font:600 12px ${FONT_SANS};
          }
          #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-switcher [aria-selected="true"]{
            background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);
          }
          #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-workspace{top:calc(var(--lsb-shell-header) + 44px)}
          #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window:not([data-lsb-shell-active="true"]){display:none}
        }
        @media(prefers-reduced-motion:reduce){
          #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window,
          #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window *{transition:none!important;scroll-behavior:auto!important}
        }
        html.lsb-skin-shell-on{
          font-size:var(--lsb-shell-font-size,14px);
        }
        html.lsb-skin-shell-on #lsb-shell{
          font-family:var(--lsb-shell-font-family,${FONT_SANS});
        }
        html.lsb-skin-shell-on #lsb-shell-window-content,
        html.lsb-skin-shell-on #lsb-shell-rail,
        html.lsb-skin-shell-on #lsb-shell-aside{
          color:var(--lsb-shell-text,var(--text,#222));
        }
        html.lsb-skin-shell-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window{
          background:var(--lsb-shell-panel,var(--panel,#fff));
        }
        html.lsb-skin-shell-on .lsb-shell-brand,
        html.lsb-skin-shell-on .lsb-shell-window-action{color:var(--lsb-shell-accent,var(--brand,#5eaaa0))}
        html.lsb-skin-glass-on #lsb-shell-header,
        html.lsb-skin-glass-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window,
        html.lsb-skin-glass-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-bar{
          background:color-mix(in srgb,var(--lsb-shell-panel,var(--panel,#fff)) var(--lsb-shell-glass-opacity,.72),transparent);
          backdrop-filter:blur(var(--lsb-shell-glass-blur,18px));
          -webkit-backdrop-filter:blur(var(--lsb-shell-glass-blur,18px));
        }
        html.lsb-skin-shell-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-glass="true"],
        html.lsb-skin-shell-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-glass="true"] .lsb-shell-window-bar{
          background:color-mix(in srgb,var(--lsb-shell-panel,var(--panel,#fff)) var(--lsb-shell-glass-opacity,.72),transparent);
          backdrop-filter:blur(var(--lsb-shell-glass-blur,18px));
          -webkit-backdrop-filter:blur(var(--lsb-shell-glass-blur,18px));
        }
        @media(prefers-reduced-transparency:reduce){
          html.lsb-skin-glass-on #lsb-shell-header,
          html.lsb-skin-glass-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window,
          html.lsb-skin-glass-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-bar{
            background:var(--lsb-shell-panel,var(--panel,#fff));backdrop-filter:none;-webkit-backdrop-filter:none;
          }
          html.lsb-skin-shell-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-glass="true"],
          html.lsb-skin-shell-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-glass="true"] .lsb-shell-window-bar{
            background:var(--lsb-shell-panel,var(--panel,#fff));backdrop-filter:none;-webkit-backdrop-filter:none;
          }
        }
      `
    }

    // · B2 canvasCss: iOS27 单画布（状态/浮层/响应式） ──
    function canvasCss() {
      return `
        html.lsb-skin-shell-on.lsb-canvas-mode{
          --lsb-canvas-safe-top:env(safe-area-inset-top,0px);
          --lsb-canvas-chrome-height:56px;
          --lsb-canvas-safe-bottom:env(safe-area-inset-bottom,0px);
          --lsb-canvas-surface-bg:color-mix(in srgb,var(--lsb-shell-panel,var(--panel,#fff)) calc(var(--lsb-shell-glass-opacity,.72) * 100%),transparent);
          --lsb-glass-fill:var(--lsb-canvas-surface-bg);
          --lsb-glass-border:color-mix(in srgb,var(--lsb-shell-text,var(--text,#222)) 18%,transparent);
          --lsb-glass-highlight:inset 0 1px 0 rgb(255 255 255 / 42%);
          --lsb-glass-shadow:0 14px 38px color-mix(in srgb,var(--lsb-shell-text,var(--text,#222)) 18%,transparent);
          --lsb-glass-blur:var(--lsb-shell-glass-blur,18px);
          --lsb-glass-saturation:140%;
          --lsb-canvas-content-bg:color-mix(in srgb,var(--lsb-shell-panel,var(--panel,#fff)) 94%,var(--bg,#f4f5f7));
          --lsb-canvas-media-scrim:rgb(8 12 22 / 18%);
          --lsb-canvas-radius:var(--lsb-shell-radius,16px);
          min-height:100%;padding:0!important;background:var(--bg,#f4f5f7);color:var(--lsb-shell-text,var(--text,#222));
          font-size:var(--lsb-shell-font-size,14px);
        }
        /* 让资料表面相对页面滚动而非被 body 的隐式滚动容器截断，sticky 才能跟随顶部状态条。 */
        html.lsb-skin-shell-on.lsb-canvas-mode body{min-height:100%;overflow-x:clip!important;overflow-y:visible!important;padding:0!important;isolation:isolate}
        html.lsb-skin-shell-on.lsb-canvas-mode #color-scheme-modal{z-index:8020!important}
        html.lsb-skin-shell-on.lsb-canvas-mode .lsb-shell-theme-modal{z-index:8020!important}
        html.lsb-skin-shell-on.lsb-canvas-mode body::before{content:'';position:fixed;inset:0;z-index:0;pointer-events:none;background:var(--lsb-canvas-media-scrim);opacity:0;transition:opacity 180ms ease}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-skin-video-on body::before,
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-skin-image-on body::before{opacity:1}
        #lsb-shell-progress{
          --lsb-shell-progress:0;
          position:fixed;top:0;left:0;right:0;z-index:8002;height:3px;
          pointer-events:none;opacity:0;background:transparent;
          transition:opacity 120ms cubic-bezier(.23,1,.32,1)
        }
        #lsb-shell-progress[data-phase="loading"],#lsb-shell-progress[data-phase="done"]{opacity:1}
        #lsb-shell-progress [data-lsb-shell-progress-bar]{display:block;width:100%;height:100%;transform:scaleX(var(--lsb-shell-progress));transform-origin:left center;background:var(--brand,#5eaaa0);transition:transform 200ms cubic-bezier(.23,1,.32,1)}
        [data-lsb-route-content-enter]{animation:lsb-route-content-in 180ms ease both}
        @keyframes lsb-route-content-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        #lsb-route-announcer{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
        @media(prefers-reduced-motion:reduce){[data-lsb-route-content-enter]{animation:none!important;transform:none!important}}
        html.lsb-canvas-reduced-motion [data-lsb-route-content-enter]{animation:none!important;transform:none!important}
        html.lsb-skin-shell-on.lsb-canvas-mode .lsb-canvas-content-root{position:relative;z-index:1;background:var(--lsb-canvas-content-bg);color:var(--lsb-shell-text,var(--text,#222))}
        html.lsb-skin-shell-on.lsb-canvas-mode main.wrap,
        html.lsb-skin-shell-on.lsb-canvas-mode .forum-main,
        html.lsb-skin-shell-on.lsb-canvas-mode .home-shell{
          box-sizing:border-box;display:block!important;width:auto!important;max-width:1120px!important;
          margin:0 auto!important;padding:calc(64px + var(--lsb-canvas-safe-top)) 24px calc(116px + var(--lsb-canvas-safe-bottom))!important;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode .lsb-canvas-content-root{padding-top:0!important}
        html.lsb-skin-shell-on.lsb-canvas-mode .lsb-canvas-content-root .home-shell,html.lsb-skin-shell-on.lsb-canvas-mode .lsb-canvas-content-root .forum-main{padding-top:0!important}
        html.lsb-skin-shell-on.lsb-canvas-mode .lsb-canvas-content-root .main-panel{padding-top:0!important}
        html.lsb-skin-shell-on.lsb-canvas-mode:not(.lsb-canvas-page-home) .lsb-canvas-content-root{margin-top:calc(64px + var(--lsb-canvas-safe-top))!important}
        html.lsb-skin-shell-on.lsb-canvas-mode main.wrap,
        html.lsb-skin-shell-on.lsb-canvas-mode .forum-main,
        html.lsb-skin-shell-on.lsb-canvas-mode .home-shell,
        html.lsb-skin-shell-on.lsb-canvas-mode .main-panel{
          font-family:var(--lsb-shell-font-family,${FONT_SANS})!important;
          font-size:var(--lsb-shell-font-size,14px);
        }
        html.lsb-skin-shell-on.lsb-canvas-mode [data-canvas-profile-slot]{
          display:block;position:relative;margin:0 0 16px;padding:0;max-width:100%;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode [data-canvas-profile-slot] > .sidebar-card.user-card{
          display:block!important;width:100%;margin:0;padding:12px 14px;border:1px solid color-mix(in srgb,var(--line,#ddd) 72%,transparent);
          border-radius:var(--lsb-canvas-radius);background:var(--lsb-canvas-surface-bg);backdrop-filter:blur(var(--lsb-shell-glass-blur,18px)) saturate(140%);
          box-shadow:0 8px 24px color-mix(in srgb,var(--text,#222) 10%,transparent);
        }
        [data-canvas-profile-slot] .user-header-info{gap:10px}
        [data-canvas-profile-slot] .user-avatar-big img,[data-canvas-profile-slot] .avatar-img{width:42px!important;height:42px!important}
        [data-canvas-profile-slot] .user-links{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
        [data-canvas-profile-slot] .user-links a{display:inline-flex;align-items:center;gap:4px;padding:5px 8px;border-radius:999px;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent);color:inherit;text-decoration:none;font-size:12px}
        [data-canvas-profile-slot] .btn-post{display:inline-flex;margin-top:10px}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user main.wrap{max-width:1120px!important;display:flex!important;flex-direction:column!important;gap:0!important}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-profile],
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list]{box-sizing:border-box;width:min(980px,100%)!important;max-width:980px!important;margin-left:auto!important;margin-right:auto!important;min-width:0}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-profile]{
          position:sticky;top:calc(10px + var(--lsb-canvas-safe-top) + var(--lsb-canvas-chrome-height) + 6px);z-index:25;margin:0 auto!important;overflow:visible;
          width:fit-content!important;max-width:min(100%,760px)!important;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-profile] > .sidebar-card.user-card{
          display:block!important;width:fit-content!important;max-width:100%;margin:0;padding:12px 14px;border:1px solid color-mix(in srgb,var(--line,#ddd) 72%,transparent);
          border-radius:var(--lsb-canvas-radius);background:var(--lsb-canvas-surface-bg);backdrop-filter:blur(var(--lsb-shell-glass-blur,18px)) saturate(140%);
          box-shadow:0 8px 24px color-mix(in srgb,var(--text,#222) 10%,transparent);transition:none;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list]{margin:12px auto 0!important;padding:12px!important;border:1px solid color-mix(in srgb,var(--line,#ddd) 72%,transparent);
          border-radius:var(--lsb-canvas-radius);background:var(--lsb-canvas-surface-bg);backdrop-filter:blur(var(--lsb-shell-glass-blur,18px)) saturate(140%);
          box-shadow:0 8px 24px color-mix(in srgb,var(--text,#222) 8%,transparent)}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list] > .home-shell,
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list] > .forum-layout,
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list] > .forum-main,
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list] .forum-layout.forum-layout-has-sidebar,
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list] .forum-main,
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list] .main-panel{
          display:block!important;width:100%!important;max-width:none!important;margin:0!important;padding:0!important;background:transparent!important;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode .forum-layout.forum-layout-has-sidebar{display:block!important;grid-template-columns:1fr!important}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .home-shell,
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .forum-main{
          padding:0!important;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home [data-canvas-profile-slot]{
          width:fit-content!important;max-width:min(100%,760px)!important;margin:0 auto 12px!important;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home [data-canvas-profile-slot] > .sidebar-card.user-card{
          width:fit-content!important;max-width:100%;max-height:none!important;overflow:visible!important;
          padding:12px 14px;border-radius:var(--lsb-canvas-radius);
        }
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home [data-canvas-profile-slot] .user-links{display:flex!important}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home [data-canvas-profile-slot] .btn-post{display:inline-flex!important}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home [data-canvas-profile-slot] .user-avatar-big img,
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home [data-canvas-profile-slot] .avatar-img{width:36px!important;height:36px!important}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .home-shell{
          background:transparent!important;border:0!important;box-shadow:none!important;border-radius:0!important;overflow:visible;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .main-panel{
          background:var(--lsb-canvas-surface-bg)!important;border:1px solid color-mix(in srgb,var(--line,#ddd) 72%,transparent);
          border-radius:var(--lsb-canvas-radius)!important;box-shadow:0 8px 24px color-mix(in srgb,var(--text,#222) 8%,transparent);
          overflow:hidden;
        }
        @media(min-width:700px){
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .lsb-canvas-content-root{
            display:flex!important;flex-direction:column!important;min-height:0!important;height:100vh!important;max-height:100vh!important;
            overflow:hidden!important;overscroll-behavior:none;
          }
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .lsb-canvas-content-root > .home-shell{
            display:flex!important;flex:1 1 auto;flex-direction:column;min-width:0;min-height:0;
          }
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .home-shell > .forum-layout.forum-layout-has-sidebar{
            display:flex!important;flex:1 1 auto;flex-direction:column;min-width:0;min-height:0;
          }
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .forum-layout.forum-layout-has-sidebar > .forum-main{
            display:flex!important;flex:1 1 auto;flex-direction:column;min-width:0;min-height:0;
          }
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .forum-main > .main-panel{
            display:flex!important;flex:1 1 auto;flex-direction:column;min-width:0;min-height:0;
            overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;scrollbar-gutter:stable;
          }
        }
        @media(max-width:699px){
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .lsb-canvas-content-root{
            height:auto!important;max-height:none!important;overflow:visible!important;
          }
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .main-panel{
            height:auto!important;max-height:none!important;overflow:visible!important;
          }
        }
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .topic-toolbar{
          min-height:44px;margin:0!important;padding:8px 12px!important;align-items:center;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode .lsb-native-header-hidden,
        html.lsb-skin-shell-on.lsb-canvas-mode .lsb-native-sidebar-hidden,
        html.lsb-skin-shell-on.lsb-canvas-mode .lsb-native-left-hidden,
        html.lsb-skin-shell-on.lsb-canvas-mode .forum-more-region{display:none!important}
        html.lsb-canvas-route-pending body > .top,
        html.lsb-canvas-route-pending body > header,
        html.lsb-canvas-route-pending body > .site-header,
        html.lsb-canvas-route-pending body > [data-site-header],
        html.lsb-canvas-route-pending .forum-more-region,
        html.lsb-canvas-route-pending aside.sidebar:not(#mobile-menu-drawer):not(.mobile-menu-drawer),
        html.lsb-canvas-route-pending .forum-enhancements-left-fixed,
        html.lsb-canvas-route-pending #mobile-menu,
        html.lsb-canvas-route-pending .mobile-menu-backdrop,
        html.lsb-canvas-route-pending .lsb-launcher{display:none!important}
        html.lsb-skin-shell-on.lsb-canvas-mode aside.sidebar:not(#mobile-menu-drawer):not(.mobile-menu-drawer),
        html.lsb-skin-shell-on.lsb-canvas-mode .forum-enhancements-left-fixed{display:none!important}
        html.lsb-skin-shell-on.lsb-canvas-mode li.post-item:not(.post-entry) .meta-icon{display:none}
        html.lsb-skin-shell-on.lsb-canvas-mode li.post-item{padding-block:8px!important;border-radius:var(--lsb-canvas-radius)}
        html.lsb-skin-shell-on.lsb-canvas-mode li.post-entry{border-radius:var(--lsb-canvas-radius)}
        #lsb-shell[data-lsb-canvas-shell]{display:block;position:fixed;inset:0;z-index:7999;pointer-events:none;font-family:var(--lsb-shell-font-family,${FONT_SANS});color:var(--lsb-shell-text,var(--text,#222))}
        #lsb-shell[data-lsb-canvas-shell] *{box-sizing:border-box}
        #lsb-shell[data-lsb-canvas-shell] > [data-lsb-shell-video],#lsb-shell[data-lsb-canvas-shell] > [data-lsb-shell-image]{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;pointer-events:none;opacity:0;transition:opacity 180ms ease}
        html.lsb-skin-video-on #lsb-shell[data-lsb-canvas-shell] > [data-lsb-shell-video]{opacity:1}
        html.lsb-skin-image-on #lsb-shell[data-lsb-canvas-shell] > [data-lsb-shell-image]{opacity:1}
        html.lsb-skin-shell-on.lsb-canvas-mode body > [data-lsb-shell-video][data-lsb-shell-video-layer="canvas"]{
          position:fixed;inset:0;width:100%;height:100%;box-sizing:border-box;object-fit:cover;
          z-index:0;pointer-events:none;opacity:0;transition:opacity 180ms ease;
        }
        html.lsb-skin-video-on.lsb-canvas-mode body > [data-lsb-shell-video][data-lsb-shell-video-layer="canvas"]{opacity:1}
        html.lsb-skin-shell-on.lsb-canvas-mode body > [data-lsb-shell-image][data-lsb-shell-image-layer="canvas"]{
          position:fixed;inset:0;width:100%;height:100%;box-sizing:border-box;object-fit:cover;
          z-index:0;pointer-events:none;opacity:0;transition:opacity 180ms ease;
        }
        html.lsb-skin-image-on.lsb-canvas-mode body > [data-lsb-shell-image][data-lsb-shell-image-layer="canvas"]{opacity:1}
        html.lsb-skin-shell-on .lsb-launcher{display:none!important}
        #lsb-shell-surfaces{position:absolute;inset:0;pointer-events:none;--lsb-canvas-chrome-height:56px}
        #lsb-shell-surfaces > [data-surface]{pointer-events:auto}
        #lsb-shell-surfaces [data-surface]{font:inherit;color:inherit}
        [data-canvas-profile-host]{
          position:fixed;top:calc(10px + var(--lsb-canvas-safe-top));left:max(12px,calc((100% - 1120px) / 2 + 24px));z-index:8004;
          display:flex;align-items:center;min-width:0;pointer-events:auto;color:inherit;
        }
        [data-canvas-profile-host][hidden]{display:none!important}
        [data-canvas-profile-host] > .sidebar-card.user-card{
          position:relative;display:block!important;box-sizing:border-box;width:190px;min-width:0;height:var(--lsb-canvas-chrome-height);max-height:var(--lsb-canvas-chrome-height);margin:0;padding:0 72px 0 10px;
          overflow:visible!important;border:1px solid var(--lsb-glass-border);border-radius:999px;background:var(--lsb-glass-fill);
          backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));
          box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow);transition:box-shadow 160ms ease;
        }
        [data-canvas-profile-host]:not([data-expanded="true"]) > .sidebar-card.user-card{overflow:hidden!important;}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-wrap{width:100%;height:100%;padding:0!important;margin:0!important;box-sizing:border-box}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-header{display:flex!important;align-items:center;min-height:100%;height:100%;margin:0!important;padding:0!important}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-header-info{display:flex!important;align-items:center;gap:6px;min-width:0;width:100%;height:100%;padding:0!important}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-avatar-big{display:flex!important;align-items:center;justify-content:center;flex:0 0 36px;width:36px!important;height:36px!important;min-width:36px}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-avatar-big img,[data-canvas-profile-host]:not([data-expanded="true"]) .avatar-img{display:block;width:36px!important;height:36px!important;min-width:36px;object-fit:cover}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-header-info > div{min-width:0;flex:0 1 auto;width:60px}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-name{display:block;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:650;line-height:16px}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-rank,
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-group,
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-title{display:none!important}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-links{position:absolute;top:50%;right:42px;display:flex!important;align-items:center;gap:4px;margin:0!important;transform:translateY(-50%)}
        [data-canvas-profile-host] .user-links a[data-canvas-profile-bell]{position:relative;display:inline-flex!important;align-items:center;justify-content:center;width:27px;height:27px;padding:0;border-radius:999px;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent);font-size:0;line-height:1;color:inherit}
        [data-canvas-profile-host] .user-links a[data-canvas-profile-bell] .meta-icon{width:16px;height:16px;margin:0}
        [data-canvas-profile-host] .user-links a[data-canvas-profile-bell]:hover,[data-canvas-profile-host] .user-links a[data-canvas-profile-bell]:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
        [data-canvas-profile-host] .user-links a[data-canvas-profile-bell] .notify-badge{position:absolute;top:-2px;right:-2px;min-width:9px;height:9px;padding:0;border:2px solid var(--lsb-shell-panel,var(--panel,#fff));border-radius:50%;font-size:0;line-height:0;background:var(--danger,#e07a7a)}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-links a:not([data-canvas-profile-bell]),
        [data-canvas-profile-host]:not([data-expanded="true"]) .btn-post{display:none!important}
        [data-canvas-profile-host][data-expanded="true"]{align-items:flex-start}
        [data-canvas-profile-host][data-expanded="true"] > .sidebar-card.user-card{position:absolute;top:calc(100% + 8px);left:0;width:min(340px,calc(100vw - 24px));height:auto;max-height:none;padding:12px 14px;border-radius:var(--lsb-canvas-radius);box-shadow:var(--lsb-glass-highlight),0 18px 44px color-mix(in srgb,var(--lsb-shell-text,var(--text,#222)) 22%,transparent)}
        [data-canvas-profile-host][data-expanded="true"] .user-links{position:static;display:flex!important;gap:6px;flex-wrap:wrap;margin-top:10px!important}
        [data-canvas-profile-host][data-expanded="true"] .user-links a:not([data-canvas-profile-bell]){display:inline-flex!important}
        [data-canvas-profile-host][data-expanded="true"] .user-links a[data-canvas-profile-bell]{display:inline-flex!important;align-items:center;justify-content:center;width:auto!important;min-width:0;height:auto!important;min-height:27px;padding:5px 8px!important;gap:4px;font-size:12px!important;line-height:1.2;white-space:nowrap}
        [data-canvas-profile-host][data-expanded="true"] .user-links a[data-canvas-profile-bell] .meta-icon{flex:0 0 auto;width:14px;height:14px;margin:0}
        [data-canvas-profile-expand]{position:absolute;top:50%;right:4px;z-index:2;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:999px;background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:16px;line-height:1;transform:translateY(-50%)}
        [data-canvas-profile-expand]:hover,[data-canvas-profile-expand]:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
        [data-canvas-profile-host][data-expanded="true"] [data-canvas-profile-expand]{background:var(--brand-soft,#e8f4f2)}
        @media(max-width:1099px){
          [data-canvas-profile-host]{top:calc(6px + var(--lsb-canvas-safe-top));left:8px;max-width:190px}
          [data-canvas-profile-host] > .sidebar-card.user-card{width:190px}
          #lsb-shell-surfaces [data-surface="top-status"]{left:210px;right:8px;transform:none;max-width:none}
          #lsb-shell-surfaces [data-surface="top-status"][data-compact="true"]{transform:translateY(-34px)}
          #lsb-shell-surfaces [data-surface="site-status"]{display:none!important}
        }
        @media(max-width:699px){
          [data-canvas-profile-host]{max-width:184px}
          [data-canvas-profile-host] > .sidebar-card.user-card{width:184px}
          [data-canvas-profile-host]:not([data-expanded="true"]) .user-header-info > div,
          [data-canvas-profile-host]:not([data-expanded="true"]) .user-name,
          [data-canvas-profile-host]:not([data-expanded="true"]) .user-rank{width:54px;max-width:54px}
          #lsb-shell-surfaces [data-surface="top-status"]{left:204px;max-width:calc(100vw - 16px);height:var(--lsb-canvas-chrome-height);min-height:var(--lsb-canvas-chrome-height)}
        }
        @media(min-width:1100px){
          #lsb-shell-surfaces [data-surface="top-status"]{width:min(620px,calc(100vw - 24px));max-width:min(620px,calc(100vw - 24px))}
          #lsb-shell-surfaces [data-surface="site-status"]{position:fixed;top:calc(10px + var(--lsb-canvas-safe-top));right:max(12px,calc((100vw - 1120px) / 2 + 12px));z-index:8000;display:flex;align-items:center;justify-content:flex-end;width:auto;height:var(--lsb-canvas-chrome-height);min-height:var(--lsb-canvas-chrome-height);padding:0;border:0;border-radius:0;background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:none;overflow:visible}
          #lsb-shell-surfaces [data-surface="site-status"][hidden]{display:none!important}
        }
        [data-canvas-backdrop]{position:fixed;inset:0;z-index:8009;background:rgb(5 8 18 / 52%);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);pointer-events:auto}
        [data-canvas-backdrop][hidden]{display:none!important}
        [data-surface="top-status"]{
          position:fixed;top:calc(10px + var(--lsb-canvas-safe-top));left:50%;transform:translateX(-50%);z-index:8000;
          display:flex;align-items:center;gap:8px;height:var(--lsb-canvas-chrome-height);min-height:var(--lsb-canvas-chrome-height);max-width:min(840px,calc(100vw - 24px));padding:7px 10px;
          border:1px solid var(--lsb-glass-border);border-radius:999px;
          background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));
          box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow);transition:opacity 160ms ease,transform 160ms ease;
        }
        [data-surface="top-status"][data-compact="true"]{opacity:.78;transform:translate(-50%,-34px)}
        [data-surface="top-status"] button,[data-surface="tool-capsule"] button,[data-surface="tool-sheet"] button{font:inherit}
        [data-surface="top-status"] [data-canvas-status-title]{flex:0 0 auto;min-width:0;max-width:46vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:650}
        [data-route-transition="in"]{animation:lsb-route-title-in 180ms ease both}
        @keyframes lsb-route-title-in{from{opacity:.45;transform:translateY(2px)}to{opacity:1;transform:none}}
        [data-canvas-status-links]{display:flex;align-items:center;gap:5px;flex:1 1 auto;min-width:0;overflow-x:auto;overscroll-behavior-inline:contain;scrollbar-width:none}
        [data-canvas-status-links]::-webkit-scrollbar{display:none}
        [data-canvas-pinned-links]{display:flex;align-items:center;gap:5px;flex:0 0 auto;min-width:0}
        [data-canvas-status-links] a,[data-canvas-pinned-links] a,[data-canvas-pinned-links] [data-canvas-navigation-trigger]{display:inline-flex;align-items:center;flex:0 0 auto;min-height:30px;padding:0 8px;border:0;border-radius:999px;
          color:inherit;text-decoration:none;font:inherit;font-size:12px;font-weight:550;white-space:nowrap;background:color-mix(in srgb,var(--panel,#fff) 48%,transparent);cursor:pointer}
        [data-canvas-status-links] a:hover,[data-canvas-status-links] a:focus-visible,[data-canvas-pinned-links] a:hover,[data-canvas-pinned-links] a:focus-visible,[data-canvas-pinned-links] [data-canvas-navigation-trigger]:hover,[data-canvas-pinned-links] [data-canvas-navigation-trigger]:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
        [data-canvas-search-host]{position:relative;display:flex;align-items:center;justify-content:center;flex:0 0 34px;width:34px;min-width:34px;max-width:34px;height:34px;margin-left:2px;overflow:visible}
        [data-canvas-search-host][hidden]{display:none!important}
        [data-canvas-search-trigger]{display:inline-flex;align-items:center;justify-content:center;flex:0 0 34px;width:34px;height:34px;padding:0;border:1px solid var(--lsb-glass-border);border-radius:50%;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent);box-shadow:var(--lsb-glass-highlight);color:inherit;cursor:pointer}
        [data-canvas-search-trigger]:hover,[data-canvas-search-trigger]:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
        [data-canvas-search-trigger] svg{display:block;width:17px;height:17px;stroke:currentColor;stroke-width:1.8;fill:none;stroke-linecap:round;stroke-linejoin:round}
        [data-canvas-search-panel]{position:absolute;top:calc(100% + 8px);right:0;z-index:8020;box-sizing:border-box;width:min(320px,calc(100vw - 24px));max-width:calc(100vw - 24px);padding:8px;border:1px solid var(--lsb-glass-border);border-radius:20px;background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow)}
        [data-canvas-search-panel][hidden]{display:none!important}
        [data-canvas-search-panel] .lsb-shell-search{display:flex!important;align-items:center;gap:4px;box-sizing:border-box;width:100%;min-width:0;max-width:none;height:34px;margin:0;padding:3px 5px 3px 9px;border:1px solid var(--lsb-glass-border);border-radius:999px;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent);box-shadow:var(--lsb-glass-highlight);overflow:hidden}
        [data-canvas-search-panel] .lsb-shell-search input[type="search"],[data-canvas-search-panel] .lsb-shell-search input[name="q"]{box-sizing:border-box;flex:1 1 auto;width:100%;min-width:0;height:26px;margin:0;padding:0 5px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:12px}
        [data-canvas-search-panel] .lsb-shell-search select{flex:0 1 auto;max-width:68px;min-width:0;height:26px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:11px}
        [data-canvas-search-panel] .lsb-shell-search button{flex:0 0 auto;min-width:28px;height:26px;padding:0 7px;border:0;border-radius:999px;background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);font:inherit;font-size:11px;cursor:pointer}
        [data-canvas-search-panel] .lsb-shell-search.search-page-link{display:flex!important;align-items:center;justify-content:space-between;min-width:40px;padding:0 9px;color:inherit;text-decoration:none;font-size:12px}
        [data-canvas-site-status-host]{position:relative;isolation:isolate;display:flex;align-items:center;gap:2px;width:auto;height:100%;min-height:var(--lsb-canvas-chrome-height);padding:0 8px 0 14px;border:0;border-radius:999px;background:transparent;box-shadow:none;overflow:visible;z-index:1;cursor:pointer;color:inherit}
        [data-canvas-site-status-host]::before{content:'';position:absolute;inset:0;z-index:0;border:1px solid var(--lsb-glass-border);border-radius:inherit;background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow);pointer-events:none}
        [data-canvas-site-status-host][hidden]{display:none!important}
        [data-canvas-site-status-body]{display:flex;align-items:center;gap:6px;width:100%;height:100%;min-width:0;overflow:hidden;border:0;border-radius:999px;background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:none}
        [data-canvas-site-status-body] > .sidebar-card{display:block!important;flex:0 0 auto!important;width:100%;height:var(--lsb-canvas-chrome-height)!important;max-height:var(--lsb-canvas-chrome-height)!important;overflow:hidden!important;margin:0;padding:0 34px 0 10px;border:0;border-radius:999px;background:transparent;box-shadow:none}
        [data-canvas-site-status-body] > .sidebar-card .quick-wrap{height:100%;padding:0!important;margin:0!important;display:flex;align-items:center;min-width:0}
        [data-canvas-site-status-body] > .sidebar-card .quick-title,[data-canvas-site-status-body] > .sidebar-card .daily-hot-topics-head{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:650}
        [data-canvas-site-status-body] > .sidebar-card .quick-links,[data-canvas-site-status-body] > .sidebar-card .daily-hot-topics-list{display:none!important}
        [data-canvas-site-status-body] [data-canvas-site-empty-state]{display:block!important;margin:0;padding:0 10px;color:var(--text-muted,#888);font-size:11px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        [data-canvas-site-status-body] [data-canvas-site-empty-state][hidden]{display:none!important}
        [data-canvas-site-status-host]:not([data-expanded="true"]) [data-canvas-site-status-body]{display:none!important}
        [data-canvas-site-status-label]{position:relative;z-index:1;display:inline-flex;align-items:center;border:0;padding:0;background:transparent;color:inherit;font:inherit;font-size:12px;font-weight:550;line-height:1;white-space:nowrap;cursor:pointer}
        [data-canvas-site-status-expand]{position:relative;z-index:1;top:auto;right:auto;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:0;border-radius:999px;background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:14px;line-height:1;transform:none}
        [data-canvas-site-status-expand]:hover,[data-canvas-site-status-expand]:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
        [data-canvas-site-status-host][data-expanded="true"]{align-items:center}
        [data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body]{position:absolute;top:calc(100% + 8px);right:0;z-index:2;display:flex;flex-direction:column;align-items:stretch;gap:0;width:min(340px,calc(100vw - 24px));height:auto;max-height:calc(100vh - 90px);overflow:auto;padding:8px 14px;border:1px solid var(--lsb-glass-border);border-radius:34px;background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow)}
        [data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body] > .sidebar-card{height:auto!important;max-height:none!important;overflow:visible!important;margin:0!important;padding:10px 2px!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}
        [data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body] > .sidebar-card + .sidebar-card{margin-top:0!important;border-top:1px solid color-mix(in srgb,var(--lsb-shell-text,var(--text,#222)) 12%,transparent)!important}
        [data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body] .quick-links,[data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body] .daily-hot-topics-list{display:block!important}
        [data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-expand]{background:var(--brand-soft,#e8f4f2)}
        html.lsb-canvas-page-user #lsb-shell-surfaces [data-surface="top-status"] [data-canvas-status-title]{max-width:24vw}
        [data-canvas-action]{border:0;background:transparent;color:inherit;cursor:pointer;border-radius:999px;min-width:30px;min-height:30px;padding:0 8px}
        [data-canvas-action]:hover,[data-canvas-action]:focus-visible{background:color-mix(in srgb,var(--brand-soft,#e8f4f2) 80%,transparent);outline:none}
        [data-surface="tool-capsule"]{
          position:fixed;left:50%;bottom:calc(14px + var(--lsb-canvas-safe-bottom));transform:translateX(-50%);z-index:8001;
          display:flex;align-items:center;gap:4px;padding:6px;border:1px solid var(--lsb-glass-border);
          border-radius:999px;background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));
          box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow)
        }
        [data-surface="tool-capsule"] button{min-width:38px;height:34px;border:0;border-radius:999px;background:transparent;color:inherit;cursor:pointer}
        [data-surface="tool-capsule"] button:hover,[data-surface="tool-capsule"] button:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
        [data-surface="tool-sheet"], [data-surface="navigation-sheet"], [data-surface="site-card"], [data-surface="appearance-sheet"], [data-surface="ai-card"], [data-surface="plugin-features-sheet"], [data-surface="plugin-settings-sheet"]{
          position:fixed;left:50%;bottom:calc(70px + var(--lsb-canvas-safe-bottom));transform:translateX(-50%);z-index:8010;
          width:min(520px,calc(100vw - 24px));max-height:min(70vh,640px);overflow:auto;padding:18px;
          border:1px solid var(--lsb-glass-border);border-radius:var(--lsb-canvas-radius);
          background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));
          box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow);opacity:1;transition:opacity 180ms ease,transform 180ms ease
        }
        [data-surface="tool-sheet"][hidden],[data-surface="navigation-sheet"][hidden],[data-surface="site-card"][hidden],[data-surface="appearance-sheet"][hidden],[data-surface="ai-card"][hidden],[data-surface="plugin-features-sheet"][hidden],[data-surface="plugin-settings-sheet"][hidden],[data-surface="context-pill"][hidden]{display:none!important}
        [data-surface="context-pill"]{
          position:fixed;display:flex;align-items:center;gap:3px;padding:4px;
          border:1px solid var(--lsb-glass-border);border-radius:999px;
          background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));
          box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow);white-space:nowrap
        }
        [data-surface="context-pill"] button{min-height:30px;padding:0 10px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}
        [data-surface="context-pill"] button:hover,[data-surface="context-pill"] button:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
        [data-surface="ai-card"][data-surface-mode="floating"]{left:auto;right:24px;bottom:88px;transform:none;width:420px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 120px);resize:both;overflow:auto}
        [data-surface="site-card"][data-surface-mode="floating"],[data-surface="evidence-card"][data-surface-mode="floating"]{transform:none;right:auto;bottom:auto;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);height:auto}
        [data-surface="site-card"][data-surface-mode="rail"]{
          position:fixed;top:calc(72px + var(--lsb-canvas-safe-top));right:max(12px,calc((100vw - 1120px) / 2));bottom:calc(70px + var(--lsb-canvas-safe-bottom));left:auto;transform:none;
          width:min(320px,calc(30vw - 24px));max-width:calc(100vw - 32px);max-height:none;height:auto;overflow:auto;padding:16px;
          border-radius:20px;z-index:8005;
        }
        [data-surface="site-card"][data-surface-mode="rail"] [data-canvas-sheet-head]{cursor:default}
        [data-surface="site-card"][data-surface-mode="rail"] [data-canvas-resize-handle]{display:none!important}
        [data-surface="ai-card"]{display:flex;flex-direction:column;gap:10px}
        [data-surface="ai-card"] [data-canvas-ai-host]{min-height:0;flex:1;overflow:auto}
        [data-surface="ai-card"][data-surface-mode="sheet"]{bottom:calc(70px + var(--lsb-canvas-safe-bottom));width:min(520px,calc(100vw - 24px));max-height:min(70vh,640px)}
        [data-surface="ai-card"][data-surface-mode="fullscreen"]{left:8px;right:8px;bottom:calc(58px + var(--lsb-canvas-safe-bottom));transform:none;width:auto;max-height:calc(100vh - 82px);border-radius:22px}
        [data-surface="ai-card"][data-ai-workbench-mounted]{padding:0!important;gap:0}
        [data-surface="ai-card"][data-ai-workbench-mounted] > [data-canvas-sheet-head]{display:none!important}
        [data-surface][data-surface-mode="floating"] [data-canvas-sheet-head]{cursor:grab;user-select:none}
        [data-surface][data-surface-mode="floating"][data-canvas-dragging="true"]{will-change:transform;cursor:grabbing}
        [data-surface][data-surface-mode="floating"] [data-canvas-resize-handle]{position:absolute;right:3px;bottom:3px;width:16px;height:16px;cursor:nwse-resize;touch-action:none}
        [data-surface] [data-canvas-sheet-head]{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;margin:-2px 0 12px;padding-top:8px}
        [data-canvas-sheet-grabber]{position:absolute;top:0;left:50%;width:34px;height:4px;transform:translateX(-50%);border-radius:999px;background:color-mix(in srgb,var(--lsb-shell-text,var(--text,#222)) 26%,transparent)}
        [data-surface][data-canvas-surface-state="opening"]{opacity:0;transform:translateX(-50%) translateY(8px) scale(.985)}
        [data-surface][data-canvas-surface-state="closing"]{opacity:0;pointer-events:none}
        [data-surface][data-surface-mode="floating"][data-canvas-surface-state="opening"]{transform:translateY(8px) scale(.985)}
        [data-surface="site-card"][data-surface-mode="rail"][data-canvas-surface-state="opening"]{transform:translateY(0) scale(1)}
        [data-surface][data-surface-mode="fullscreen"][data-canvas-surface-state="opening"]{transform:translateY(12px) scale(.99)}
        [data-surface] [data-canvas-sheet-head] h2{margin:0;font-size:16px;line-height:1.3}
        [data-surface] [data-canvas-close]{border:0;border-radius:999px;background:transparent;color:inherit;cursor:pointer;width:32px;height:32px;font-size:18px}
        [data-surface] [data-canvas-close]:hover,[data-surface] [data-canvas-close]:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
        [data-surface="tool-sheet"] [data-tool-grid]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:14px}
        [data-surface="tool-sheet"] [data-tool-action]{min-height:46px;padding:10px;border:1px solid var(--line-soft,#e8e8e8);border-radius:12px;background:color-mix(in srgb,var(--panel,#fff) 48%,transparent);color:inherit;text-align:left;cursor:pointer}
        [data-surface="tool-sheet"] [data-tool-action]:hover,[data-surface="tool-sheet"] [data-tool-action]:focus-visible{border-color:var(--brand,#5eaaa0);outline:none}
        [data-surface="tool-sheet"] [data-canvas-query]{display:flex;gap:8px;align-items:flex-end}
        [data-surface="tool-sheet"] textarea{flex:1;min-height:70px;resize:vertical;border:1px solid var(--line,#ddd);border-radius:12px;padding:9px;background:color-mix(in srgb,var(--panel,#fff) 64%,transparent);color:inherit;font:inherit}
        [data-surface="tool-sheet"] [data-canvas-send]{min-height:38px;border:0;border-radius:999px;padding:0 16px;background:var(--brand,#5eaaa0);color:#fff;cursor:pointer}
        [data-surface="plugin-features-sheet"] [data-plugin-feature-list],[data-surface="plugin-settings-sheet"] [data-plugin-settings-list]{display:grid;gap:7px;margin:8px 0 14px}
        [data-surface="plugin-features-sheet"] [data-plugin-feature-list] .lsb-empty,[data-surface="plugin-settings-sheet"] [data-plugin-settings-list] .lsb-empty{margin:0;padding:10px;border-radius:10px;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent)}
        .lsb-plugin-entry{display:flex;align-items:center;gap:6px;min-width:0;padding:4px;border:1px solid var(--line-soft,#e8e8e8);border-radius:12px;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent)}
        .lsb-plugin-entry-main,.lsb-plugin-entry-settings,.lsb-plugin-settings-entry,[data-plugin-settings-directory],[data-plugin-settings-back]{min-height:38px;border:0;border-radius:9px;background:transparent;color:inherit;font:inherit;cursor:pointer}
        .lsb-plugin-entry-main{flex:1;min-width:0;padding:7px 10px;text-align:left}
        .lsb-plugin-entry-settings{flex:0 0 38px;padding:0;font-size:17px}
        .lsb-plugin-settings-entry{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:8px 10px;border:1px solid var(--line-soft,#e8e8e8);text-align:left}
        .lsb-plugin-settings-entry small{color:var(--text-muted,#888);font-size:11px}
        [data-plugin-settings-directory]{padding:7px 12px;border:1px solid var(--line,#ddd);background:color-mix(in srgb,var(--panel,#fff) 48%,transparent)}
        [data-plugin-settings-back]{margin:-4px 0 8px;padding:4px 9px;color:var(--text-muted,#888)}
        .lsb-plugin-entry button:hover,.lsb-plugin-settings-entry:hover,[data-plugin-settings-directory]:hover,[data-plugin-settings-back]:hover{background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0)}
        [data-surface="plugin-features-sheet"] h3,[data-surface="plugin-settings-sheet"] h3{margin:10px 0 6px;font-size:13px}
        [data-surface="site-card"] [data-canvas-site-sidebar]{display:flex;flex-direction:column;gap:10px;margin-top:14px;max-height:none!important;overflow:visible!important;padding-right:2px}
        [data-surface="site-card"] [data-canvas-site-sidebar]:empty::before{content:'当前页面没有可用的站点侧栏信息';display:block;padding:12px;border-radius:12px;color:var(--text-muted,#888);background:color-mix(in srgb,var(--panel,#fff) 38%,transparent);font-size:12px}
        [data-surface="site-card"] [data-canvas-site-empty-state]{display:block;margin:14px 0 0;padding:12px;border-radius:12px;color:var(--text-muted,#888);background:color-mix(in srgb,var(--panel,#fff) 38%,transparent);font-size:12px}
        [data-surface="site-card"] [data-canvas-site-empty-state][hidden]{display:none!important}
        [data-surface="site-card"] [data-canvas-site-sidebar] > .sidebar-card{display:block!important;flex:0 0 auto!important;width:100%;height:auto!important;max-height:none!important;overflow:visible!important;margin:0;padding:12px;border:1px solid color-mix(in srgb,var(--line,#ddd) 62%,transparent);border-radius:14px;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent);box-shadow:none}
        [data-surface="site-card"] [data-canvas-site-sidebar] .quick-links{max-height:none!important;overflow:visible!important}
        [data-surface="site-card"]{height:auto;max-height:calc(100vh - 32px)}
        [data-surface="site-card"][data-surface-mode="sheet"],[data-surface="site-card"][data-surface-mode="fullscreen"]{height:auto;max-height:calc(100vh - 82px)}
        [data-surface="appearance-sheet"] [data-canvas-appearance-controls]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}
        [data-surface="appearance-sheet"] [data-canvas-background-modes]{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:14px}
        [data-surface="appearance-sheet"] [data-canvas-background-modes] strong{font-size:12px;color:var(--text-muted,#888);font-weight:600;margin-right:2px}
        [data-surface="appearance-sheet"] [data-canvas-background-modes] button{min-height:32px;padding:5px 10px;border:1px solid var(--line,#ddd);border-radius:999px;background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:12px}
        [data-surface="appearance-sheet"] [data-canvas-background-modes] button[aria-pressed="true"]{border-color:var(--lsb-shell-accent,var(--brand,#5eaaa0));background:var(--brand-soft,#e8f4f2);color:var(--lsb-shell-accent,var(--brand,#5eaaa0));font-weight:600}
        [data-surface="appearance-sheet"] [data-canvas-appearance-controls] label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--text-muted,#888)}
        [data-surface="appearance-sheet"] [data-canvas-appearance-controls] input{width:100%;min-width:0;border:1px solid var(--line,#ddd);border-radius:9px;padding:6px;background:color-mix(in srgb,var(--panel,#fff) 70%,transparent);color:inherit;font:inherit}
        [data-surface="appearance-sheet"] [data-canvas-appearance-controls] input[type="range"]{padding:0}
        [data-surface="appearance-sheet"] [data-canvas-appearance-actions]{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
        [data-surface="appearance-sheet"] [data-canvas-appearance-actions] button{border:1px solid var(--line,#ddd);border-radius:999px;padding:7px 11px;background:transparent;color:inherit;cursor:pointer}
        [data-surface="top-status"] button:focus-visible,[data-surface="tool-capsule"] button:focus-visible,[data-surface="tool-sheet"] button:focus-visible,[data-surface="navigation-sheet"] a:focus-visible{outline:2px solid var(--brand,#5eaaa0);outline-offset:2px}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-skin-glass-on #lsb-shell-surfaces [data-surface]{background:var(--lsb-canvas-surface-bg)}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-skin-glass-on #lsb-shell-surfaces [data-surface="site-status"]{background:transparent;border:0;border-radius:0;box-shadow:none;overflow:visible}
        @media(max-width:699px){
          html.lsb-skin-shell-on.lsb-canvas-mode main.wrap,html.lsb-skin-shell-on.lsb-canvas-mode .forum-main,html.lsb-skin-shell-on.lsb-canvas-mode .home-shell{padding-inline:14px!important}
          [data-surface="top-status"]{max-width:calc(100vw - 16px);top:calc(6px + var(--lsb-canvas-safe-top));height:var(--lsb-canvas-chrome-height);min-height:var(--lsb-canvas-chrome-height)}
          [data-surface="top-status"] [data-canvas-status-title]{max-width:42vw}
          html.lsb-canvas-page-user #lsb-shell-surfaces [data-surface="top-status"]{width:calc(100vw - 16px);gap:4px;padding:5px 6px}
          html.lsb-canvas-page-user #lsb-shell-surfaces [data-surface="top-status"] [data-canvas-status-title]{max-width:20vw}
          #lsb-shell-surfaces [data-surface="site-status"]{display:none!important}
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-profile]{position:sticky!important;top:calc(6px + var(--lsb-canvas-safe-top) + var(--lsb-canvas-chrome-height))!important;z-index:25!important}
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list]{padding:8px!important}
          [data-surface="tool-sheet"],[data-surface="navigation-sheet"],[data-surface="site-card"],[data-surface="appearance-sheet"],[data-surface="ai-card"],[data-surface="plugin-features-sheet"],[data-surface="plugin-settings-sheet"]{left:8px;right:8px;bottom:calc(58px + var(--lsb-canvas-safe-bottom));transform:none;width:auto;max-height:calc(100vh - 82px);border-radius:22px}
          [data-surface="tool-capsule"]{bottom:calc(8px + var(--lsb-canvas-safe-bottom));max-width:calc(100vw - 16px)}
          [data-surface="site-card"][data-surface-mode="rail"]{top:calc(6px + var(--lsb-canvas-safe-top) + var(--lsb-canvas-chrome-height));right:8px;bottom:calc(58px + var(--lsb-canvas-safe-bottom));left:8px;width:auto;max-width:none;max-height:calc(100vh - 82px);border-radius:22px}
          [data-surface="appearance-sheet"] [data-canvas-appearance-controls]{grid-template-columns:1fr!important}
          [data-surface="appearance-sheet"] [data-canvas-appearance-actions]{flex-direction:column!important;align-items:stretch!important}
          [data-surface="appearance-sheet"] [data-canvas-appearance-actions] button{min-height:40px}
        }
        @media(prefers-reduced-transparency:reduce){
          #lsb-shell-surfaces [data-surface]{background:var(--lsb-shell-panel,var(--panel,#fff));backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:0 8px 24px rgb(0 0 0 / 12%)}
          [data-canvas-site-status-host]::before,[data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body]{background:var(--lsb-shell-panel,var(--panel,#fff));backdrop-filter:none;-webkit-backdrop-filter:none}
          html.lsb-skin-shell-on.lsb-canvas-mode{--lsb-glass-fill:var(--lsb-shell-panel,var(--panel,#fff));--lsb-canvas-media-scrim:rgb(8 12 22 / 26%)}
        }
        @media(prefers-reduced-motion:reduce){
          #lsb-shell-surfaces [data-surface],#lsb-shell-progress,html.lsb-skin-shell-on.lsb-canvas-mode body::before{transition:none!important;scroll-behavior:auto!important}
          #lsb-shell-progress [data-lsb-shell-progress-bar]{transition:none!important}
          [data-route-transition="in"]{animation:none!important}
          [data-surface][data-canvas-surface-state="opening"],[data-surface][data-canvas-surface-state="closing"]{transform:none!important}
        }
        @media(prefers-reduced-motion:reduce){html.lsb-canvas-page-user [data-lsb-canvas-profile] > .sidebar-card.user-card{transition:none!important}}
        html.lsb-canvas-reduced-transparency #lsb-shell-surfaces [data-surface]{background:var(--lsb-shell-panel,var(--panel,#fff));backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:0 8px 24px rgb(0 0 0 / 12%)}
        html.lsb-canvas-reduced-transparency [data-canvas-site-status-host]::before,html.lsb-canvas-reduced-transparency [data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body]{background:var(--lsb-shell-panel,var(--panel,#fff));backdrop-filter:none;-webkit-backdrop-filter:none}
        html.lsb-canvas-reduced-motion #lsb-shell-surfaces [data-surface],html.lsb-canvas-reduced-motion #lsb-shell-progress{transition:none!important;scroll-behavior:auto!important}
        html.lsb-canvas-reduced-motion #lsb-shell-progress [data-lsb-shell-progress-bar]{transition:none!important}
        html.lsb-canvas-reduced-motion [data-route-transition="in"]{animation:none!important}
        html.lsb-canvas-reduced-motion [data-surface][data-canvas-surface-state="opening"],html.lsb-canvas-reduced-motion [data-surface][data-canvas-surface-state="closing"]{transform:none!important}
      `
    }

    // · B3 css: 全局正文排版/列表密度/代码块/楼层 ──
    function css() {
      const parts = []

      if (shellUiActive()) {
        parts.push(effectiveUiMode() === 'ios27' ? canvasCss() : shellCss())
      }

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
    // · B4 applyShellTokens: 玻璃/字号/字体令牌注入 ──
    function applyShellTokens() {
      const root = document.documentElement
      const appearance = canvasEffective?.appearance || {}
      const canvasOn = !!cfg.shell && effectiveUiMode() === 'ios27'
      const shellOn = shellUiActive()
      root.classList.toggle('lsb-canvas-reduced-motion', canvasOn && appearance.motion === 'reduced')
      root.classList.toggle('lsb-canvas-reduced-transparency', canvasOn && appearance.transparency === 'reduced')
      if (!shellStyleApi) return
      if (!shellOn) {
        for (const prop of shellTokenProps) root.style.removeProperty(prop)
        shellTokenProps.clear()
        root.classList.remove('lsb-skin-glass-on', 'lsb-canvas-reduced-motion', 'lsb-canvas-reduced-transparency')
        return
      }
      const globalTokens = {
        baseFontSize: appearance.fontSize ?? cfg.baseFontSize,
        fontFamily: appearance.fontFamily || cfg.fontFamily,
        textColor: appearance.textColor,
        panelColor: appearance.panelColor,
        accentColor: appearance.accentColor,
        glassOpacity: appearance.opacity ?? (cfg.glass ? (cfg.glassOpacity ?? 0.72) : 0.72),
        glassBlur: appearance.blur ?? (cfg.glass ? (cfg.glassBlur ?? 18) : 18),
        density: cfg.density,
      }
      const tokens = shellStyleApi.mergeShellTokens(globalTokens, {})
      const cssText = shellStyleApi.tokenCss(tokens)
      const nextProps = new Set()
      for (const declaration of cssText.split(';')) {
        const index = declaration.indexOf(':')
        if (index <= 0) continue
        const prop = declaration.slice(0, index).trim()
        const value = declaration.slice(index + 1).trim()
        if (!prop.startsWith('--lsb-shell-') || !value) continue
        root.style.setProperty(prop, value)
        nextProps.add(prop)
      }
      for (const prop of shellTokenProps) if (!nextProps.has(prop)) root.style.removeProperty(prop)
      shellTokenProps.clear()
      for (const prop of nextProps) shellTokenProps.add(prop)
      const radius = canvasFinite(appearance.radius, 16)
      root.style.setProperty('--lsb-shell-radius', `${Math.max(8, Math.min(32, radius))}px`)
      shellTokenProps.add('--lsb-shell-radius')
      root.classList.toggle('lsb-skin-glass-on', shellOn)
    }

    // ── C: 媒体与背景（mediaOriginKey/ensureMediaDb/syncBackgroundMedia） ──
    // · C1 mediaOriginKey/ensureMediaDb: IndexedDB 媒体键与库 ──
    function mediaOriginKey(kind) {
      return `${location.origin}:${kind}`
    }

    function ensureMediaDb() {
      if (!api.ui.shellMedia?.openMediaDb) return Promise.resolve(null)
      if (!mediaDbPromise) {
        mediaDbPromise = Promise.resolve(api.ui.shellMedia.openMediaDb(window.indexedDB, 'lsb_skin_media')).catch(() => null)
      }
      return mediaDbPromise
    }

    function releaseBackgroundVideo() {
      if (backgroundVideo) {
        backgroundVideo.pause?.()
        backgroundVideo.remove()
        backgroundVideo = null
      }
      if (backgroundVideoObjectUrl) {
        try { URL.revokeObjectURL(backgroundVideoObjectUrl) } catch { /* ignore */ }
        backgroundVideoObjectUrl = ''
      }
    }

    function releaseBackgroundImage() {
      backgroundImage?.remove?.()
      backgroundImage = null
      if (backgroundImageObjectUrl) {
        try { URL.revokeObjectURL(backgroundImageObjectUrl) } catch { /* ignore */ }
        backgroundImageObjectUrl = ''
      }
    }

    function releaseBackgroundMedia() {
      releaseBackgroundVideo()
      releaseBackgroundImage()
    }

    function holdSpaRouteChrome(serial) {
      if (serial !== spaSerial) return false
      spaRouteChromeSerial = serial
      document.documentElement.classList.add(SPA_ROUTE_PENDING_CLASS)
      return true
    }

    function releaseSpaRouteChrome(serial) {
      if (serial !== spaSerial || spaRouteChromeSerial !== serial) return false
      spaRouteChromeSerial = 0
      document.documentElement.classList.remove(SPA_ROUTE_PENDING_CLASS)
      return true
    }

    function clearSpaRouteChromeHold() {
      spaRouteChromeSerial = 0
      document.documentElement.classList.remove(SPA_ROUTE_PENDING_CLASS)
    }

    function setRoutePhase(serial, phase) {
      if (serial !== spaSerial) return false
      const root = document.documentElement
      if (phase) root.dataset.lsbRoutePhase = phase
      else delete root.dataset.lsbRoutePhase
      return true
    }

    function settleSpaRoute(serial) {
      if (serial !== spaSerial) return false
      delete document.documentElement.dataset.lsbRoutePhase
      releaseSpaRouteChrome(serial)
      return true
    }

    function releaseFontFace() {
      loadedFontFace?.dispose?.()
      loadedFontFace = null
      loadedFontObjectUrl = ''
    }

    async function loadLocalMedia(kind, key) {
      if (!key || !api.ui.shellMedia?.readMedia) return null
      const db = await ensureMediaDb()
      if (!db) return null
      try {
        const value = await api.ui.shellMedia.readMedia({ db, kind, key: String(key) })
        if (value && api.ui.shellMedia.validateMediaFile) {
          const check = api.ui.shellMedia.validateMediaFile(value, { kind })
          if (!check.ok) return null
        }
        return value
      } catch {
        return null
      }
    }

    // · C2 syncBackgroundMedia/syncShellFont: 背景/字体同步链 ──
    async function syncBackgroundMedia() {
      const root = document.documentElement
      const canvasMode = canvasShell instanceof Element && canvasShell.getAttribute('data-lsb-canvas-shell') === 'true'
      const workspace = canvasMode ? document.body : shellWorkspace()
      const appearance = canvasEffective?.appearance || {}
      const requestedMode = String(appearance.background || '').toLowerCase()
      const mode = requestedMode === 'video' || (requestedMode !== 'image' && cfg.backgroundVideoEnabled === true) ? 'video' : requestedMode === 'image' ? 'image' : 'static'
      const remoteVideo = String(appearance.backgroundVideoUrl || cfg.backgroundVideoUrl || '').trim()
      const localVideoKey = String(appearance.backgroundVideoLocalKey || cfg.backgroundVideoLocalKey || '').trim()
      const remoteImage = String(appearance.backgroundImageUrl || cfg.backgroundImageUrl || '').trim()
      const localImageKey = String(appearance.backgroundImageLocalKey || cfg.backgroundImageLocalKey || '').trim()
      const validVideo = !!api.ui.shellMedia?.isHttpsUrl?.(remoteVideo)
      const validImage = !!api.ui.shellMedia?.isHttpsUrl?.(remoteImage)
      const sourceKey = mode === 'video'
        ? `${validVideo ? remoteVideo : ''}|${localVideoKey}`
        : mode === 'image'
          ? `${validImage ? remoteImage : ''}|${localImageKey}`
          : ''
      const specKey = `${mode}|${appearance.motion || 'auto'}|${sourceKey}`
      if (specKey === backgroundSpecKey && (mode === 'video' ? backgroundVideo : mode === 'image' ? backgroundImage : !backgroundVideo && !backgroundImage)) return
      backgroundSpecKey = specKey
      mediaGeneration += 1
      const generation = mediaGeneration
      releaseBackgroundMedia()
      root.classList.remove('lsb-skin-video-on')
      root.classList.remove('lsb-skin-image-on')
      if (!cfg.shell || mode === 'static' || !(workspace instanceof Element)) return

      let source = ''
      const kind = mode === 'video' ? 'video' : 'image'
      const localKey = mode === 'video' ? localVideoKey : localImageKey
      const remote = mode === 'video' ? remoteVideo : remoteImage
      const validRemote = mode === 'video' ? validVideo : validImage
      if (localKey) {
        const file = await loadLocalMedia(kind, localKey)
        if (generation !== mediaGeneration) return
        if (file) {
          try {
            const objectUrl = URL.createObjectURL(file)
            if (mode === 'video') backgroundVideoObjectUrl = objectUrl
            else backgroundImageObjectUrl = objectUrl
            source = objectUrl
          } catch { source = '' }
        }
      }
      if (!source && validRemote) source = remote
      if (generation !== mediaGeneration || !source) return

      if (mode === 'image') {
        const image = document.createElement('img')
        image.setAttribute('data-lsb-shell-image', '')
        image.setAttribute('data-lsb-shell-image-layer', canvasMode ? 'canvas' : 'windowed')
        image.setAttribute('aria-hidden', 'true')
        image.alt = ''
        image.decoding = 'async'
        image.loading = 'eager'
        image.addEventListener('error', () => {
          if (generation !== mediaGeneration || backgroundImage !== image) return
          root.classList.remove('lsb-skin-image-on')
          image.dataset.lsbShellImageState = 'error'
          api.ui.toast?.('静态背景加载失败，已使用原始背景', { type: 'error' })
        })
        workspace.prepend(image)
        backgroundImage = image
        image.src = source
        if (generation === mediaGeneration && backgroundImage === image) {
          root.classList.add('lsb-skin-image-on')
          image.dataset.lsbShellImageState = 'loaded'
        }
        return
      }

      const video = document.createElement('video')
      video.setAttribute('data-lsb-shell-video', '')
      video.setAttribute('data-lsb-shell-video-layer', canvasMode ? 'canvas' : 'windowed')
      video.setAttribute('aria-hidden', 'true')
      video.setAttribute('muted', '')
      video.setAttribute('autoplay', '')
      video.setAttribute('loop', '')
      video.setAttribute('playsinline', '')
      video.defaultMuted = true
      video.muted = true
      video.loop = true
      video.autoplay = true
      video.playsInline = true
      video.preload = 'auto'
      const markVideoError = () => {
        if (generation !== mediaGeneration || backgroundVideo !== video) return
        if (video.dataset.lsbShellVideoState === 'error') return
        root.classList.remove('lsb-skin-video-on')
        video.controls = false
        video.style.pointerEvents = 'none'
        video.dataset.lsbShellVideoState = 'error'
        api.ui.toast?.('视频背景加载失败，已使用静态背景', { type: 'error' })
      }
      video.addEventListener('error', markVideoError)
      workspace.prepend(video)
      backgroundVideo = video
      video.src = source
      try { video.load?.() } catch { /* an older media element may not expose load */ }
      const exposeManualPlayback = (message) => {
        if (generation !== mediaGeneration || backgroundVideo !== video) return
        if (video.dataset.lsbShellVideoState === 'error' || video.error) return
        root.classList.add('lsb-skin-video-on')
        video.controls = false
        video.style.pointerEvents = 'none'
        video.dataset.lsbShellVideoState = 'manual'
        if (message) api.ui.toast?.(message, { type: 'info' })
      }
      if (appearance.motion === 'reduced' || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
        exposeManualPlayback('视频已暂停以减少动态')
        return
      }
      try {
        await video.play()
        if (generation === mediaGeneration && backgroundVideo === video) {
          if (video.dataset.lsbShellVideoState === 'error' || video.error) return
          root.classList.add('lsb-skin-video-on')
          video.controls = false
          video.style.pointerEvents = 'none'
          video.dataset.lsbShellVideoState = 'playing'
        }
      } catch {
        exposeManualPlayback('浏览器阻止自动播放，视频背景保持静止')
      }
    }

    async function syncBackgroundVideo() {
      return syncBackgroundMedia()
    }

    async function syncShellFont() {
      const root = document.documentElement
      const appearance = canvasEffective?.appearance || {}
      const remote = String(appearance.fontUrl || cfg.fontUrl || '').trim()
      const localKey = String(appearance.fontLocalKey || cfg.fontLocalKey || '').trim()
      const validRemote = !!api.ui.shellMedia?.isHttpsUrl?.(remote)
      const specKey = `${validRemote ? remote : ''}|${localKey}`
      if (specKey === fontSpecKey && (loadedFontFace || !remote && !localKey)) return
      fontSpecKey = specKey
      releaseFontFace()
      const configuredFamily = shellStyleApi?.sanitizeTokenValue?.('fontFamily', appearance.fontFamily || cfg.fontFamily)
      if (configuredFamily) root.style.setProperty('--lsb-shell-font-family', configuredFamily)
      else root.style.removeProperty('--lsb-shell-font-family')
      if (!validRemote && !localKey) return
      const generation = mediaGeneration
      let source = validRemote ? `url(${remote})` : null
      if (!source && localKey) source = await loadLocalMedia('font', localKey)
      if (generation !== mediaGeneration || !source || !api.ui.shellMedia?.loadFontFace) return
      try {
        loadedFontFace = await api.ui.shellMedia.loadFontFace({
          family: 'LSBShellUserFont',
          source,
          document,
          URLCtor: URL,
        })
        if (generation === mediaGeneration) root.style.setProperty('--lsb-shell-font-family', 'LSBShellUserFont')
      } catch {
        loadedFontFace = null
        if (!configuredFamily) root.style.removeProperty('--lsb-shell-font-family')
        api.ui.toast?.('字体加载失败，已回退站点字体', { type: 'error' })
      }
    }

    function syncShellMedia() {
      void syncBackgroundMedia()
      void syncShellFont()
    }

    // ── D: 原生结构接管（applyMarkers/restyle/nativeHeaders） ──
    // · D1 applyMarkers: 逐容器打点与兴趣节点标记 ──
    function applyMarkers() {
      const root = document.documentElement
      const shellOn = shellUiActive()
      const canvasOn = !!cfg.shell && effectiveUiMode() === 'ios27'
      const shellHome = shellOn && (pagePath() === '/' || pagePath() === '/index.php')
      root.classList.toggle('lsb-skin-type-on', !!cfg.typography)
      root.classList.toggle('lsb-skin-density-compact', cfg.density === '紧凑')
      root.classList.toggle('lsb-skin-code-on', !!cfg.codeblock)
      root.classList.toggle('lsb-skin-floors-on', !!cfg.floors)
      root.classList.toggle('lsb-skin-measure-on', !!cfg.measure)
      root.classList.toggle('lsb-skin-shell-on', shellOn)
      root.classList.toggle('lsb-skin-shell-home', shellHome)
      root.classList.toggle('lsb-canvas-mode', canvasOn)
      root.classList.toggle('lsb-skin-shell-topic', shellOn && api.page?.type === 'topic')
      root.classList.toggle('lsb-skin-shell-user', shellOn && api.page?.type === 'user')
      /* 旧模式始终为固定三栏；窗口化布局已不再是可选模式。 */
      root.classList.remove('lsb-skin-shell-windowed')
      root.removeAttribute('data-lsb-shell-mode')
    }

    // · D2 restyle: 按兴趣重写布局骨架（topic/suite 归一） ──
    function restyle() {
      applyMarkers()
      applyShellTokens()
      const id = 'lsb-skin-style'
      let el = document.getElementById(id)
      if (!el) {
        el = document.createElement('style')
        el.id = id
        document.head.appendChild(el)
      }
      el.textContent = css()
    }

    // · D3 nativeHeaders/Sidebars: 原生头部/侧栏收敛 ──
    function nativeHeaders() {
      const headers = new Set(document.querySelectorAll('body > .top, body > header, body > .site-header, body > [data-site-header]'))
      for (const menu of document.querySelectorAll('[data-slot~="top.menu_links"]')) {
        if (menu.closest('#mobile-menu, #mobile-menu-drawer, .mobile-menu-drawer')) continue
        let header = menu
        while (header.parentElement && header.parentElement !== document.body) header = header.parentElement
        if (header.parentElement === document.body) headers.add(header)
      }
      return [...headers]
    }

    function nativeSidebars() {
      return [...new Set(document.querySelectorAll('aside.sidebar, [data-slot~="sidebar.stack"]'))].filter(
        (el) => el.id !== 'mobile-menu-drawer' && !el.classList.contains('mobile-menu-drawer'),
      )
    }

    function nativeLeftRails(scope = document) {
      return [...(scope?.querySelectorAll?.('.forum-enhancements-left-fixed') || [])]
    }

    function markNative(on) {
      for (const el of nativeHeaders()) el.classList.toggle('lsb-native-header-hidden', on)
      for (const el of nativeSidebars()) el.classList.toggle('lsb-native-sidebar-hidden', on)
      for (const el of nativeLeftRails()) el.classList.toggle('lsb-native-left-hidden', on)
      for (const el of document.querySelectorAll('.sidebar-card.user-card')) el.toggleAttribute('data-lsb-shell-me', on)
    }

    // ── E: 侧栏与氢壳视图（asideWide/asideSetActive/syncAsideViews） ──
    // · E1 asideWide: 侧栏宽度与可见性判定 ──
    function asideWide() {
      try {
        if (typeof window.matchMedia === 'function') return !!window.matchMedia('(min-width: 1100px)').matches
      } catch {
        /* jsdom and older embedded browsers may not implement matchMedia */
      }
      const width = Number(window.innerWidth || document.documentElement?.clientWidth || 0)
      return width >= 1100
    }

    function onUiModeResize() {
      const wide = asideWide()
      if (wide === uiModeWideSnapshot) return
      uiModeWideSnapshot = wide
      scheduleRefresh(false)
    }

    function bindUiModeResize() {
      if (uiModeResizeBound) return
      uiModeResizeBound = true
      uiModeWideSnapshot = asideWide()
      window.addEventListener('resize', onUiModeResize)
    }

    function unbindUiModeResize() {
      if (!uiModeResizeBound) return
      window.removeEventListener('resize', onUiModeResize)
      uiModeResizeBound = false
      uiModeWideSnapshot = null
    }

    function bindCloudflareChallengeWatch() {
      if (cloudflareChallengeObserver || typeof MutationObserver !== 'function') return
      const root = document.documentElement
      if (!root) return
      cloudflareChallengeObserver = new MutationObserver(() => scheduleRefresh(false))
      cloudflareChallengeObserver.observe(root, {
        attributes: true,
        attributeFilter: [CLOUDFLARE_CHALLENGE_ATTR],
      })
    }

    function unbindCloudflareChallengeWatch() {
      cloudflareChallengeObserver?.disconnect?.()
      cloudflareChallengeObserver = null
    }

    function shellUiActive() {
      return !!cfg.shell && (effectiveUiMode() === 'ios27' || asideWide())
    }

    function asideContext() {
      return {
        page: api.page,
        route: api.page,
        snapshot: api.snapshot,
        wide: asideWide(),
      }
    }

    // · E2 asideSetActive/removeAsideView: 侧栏视图激活与销毁 ──
    function asideSetActive(id, aside = document.querySelector('#lsb-shell-aside'), persist = false) {
      if (!(aside instanceof Element)) return 'site'
      const registered = api.ui.shellAsideViews(asideContext()).find((view) => view.id === id)
      const exists = id === 'site' || asideViews.has(id) || !!registered
      asideActiveId = exists ? id : 'site'
      if (persist && exists) {
        asidePreferredId = asideActiveId
        try {
          api.store.set(ASIDE_ACTIVE_KEY, asidePreferredId)
        } catch {
          /* A storage failure must not block the current tab selection. */
        }
      }
      for (const tab of aside.querySelectorAll('[data-lsb-shell-aside-tab]')) {
        const active = tab.getAttribute('data-lsb-shell-aside-tab') === asideActiveId
        tab.setAttribute('aria-selected', active ? 'true' : 'false')
        tab.tabIndex = active ? 0 : -1
      }
      for (const pane of aside.querySelectorAll('[data-lsb-shell-aside-pane]')) {
        pane.hidden = pane.getAttribute('data-lsb-shell-aside-pane') !== asideActiveId
      }
      const selectedView = asideViews.get(asideActiveId)?.view
        || api.ui.shellAsideViews(asideContext()).find((view) => view.id === asideActiveId)
      const windowId = selectedView?.windowId || 'site'
      if (windowId !== 'site' && shellWindowLayout?.windows?.[windowId]) focusShellWindow(windowId)
      for (const current of externalWindowViews.values()) {
        if (current.view?.windowId) current.host.dataset.lsbShellOpen = current.view.id === asideActiveId ? 'true' : 'false'
      }
      return asideActiveId
    }

    function removeAsideView(id) {
      const rec = asideViews.get(id)
      if (!rec) return
      try {
        rec.dispose?.()
      } catch (e) {
        console.error('[LSB skin] 右栏视图清理失败', id, e)
      }
      rec.tab?.remove()
      rec.pane?.remove()
      asideViews.delete(id)
      if (asideActiveId === id) asideActiveId = 'site'
    }

    function destroyAsideViews() {
      for (const id of [...asideViews.keys()]) removeAsideView(id)
      asideActiveId = 'site'
    }

    // · E3 syncAsideViews/bindAsideResize: 侧栏视图同步与自适应 ──
    function syncAsideViews(el = document.getElementById('lsb-shell')) {
      const aside = el?.querySelector?.('#lsb-shell-aside') || document.querySelector('#lsb-shell-aside')
      if (!(aside instanceof Element)) return
      const tabs = aside.querySelector('#lsb-shell-aside-tabs')
      const panes = aside.querySelector('.lsb-shell-aside-panes')
      const site = panes?.querySelector('[data-lsb-shell-aside-pane="site"]')
      if (!(tabs instanceof Element) || !(panes instanceof Element) || !(site instanceof Element)) return

      const wide = asideWide()
      const context = asideContext()
      const visible = wide ? api.ui.shellAsideViews(context) : []
      const next = new Map(visible.map((view) => [view.id, view]))

      for (const id of [...asideViews.keys()]) {
        const view = next.get(id)
        const current = asideViews.get(id)
        if (!view || current.view !== view) removeAsideView(id)
      }

      let siteTab = tabs.querySelector('[data-lsb-shell-aside-tab="site"]')
      if (!siteTab) {
        siteTab = document.createElement('button')
        siteTab.type = 'button'
        siteTab.setAttribute('role', 'tab')
        siteTab.setAttribute('data-lsb-shell-aside-tab', 'site')
        siteTab.textContent = '站点'
        siteTab.addEventListener('click', () => asideSetActive('site', aside, true))
        tabs.append(siteTab)
      }

      for (const view of visible) {
        let rec = asideViews.get(view.id)
        if (!rec) {
          const tab = document.createElement('button')
          tab.type = 'button'
          tab.setAttribute('role', 'tab')
          tab.setAttribute('data-lsb-shell-aside-tab', view.id)
          tab.textContent = view.label
          const pane = document.createElement('section')
          pane.setAttribute('role', 'tabpanel')
          pane.setAttribute('data-lsb-shell-aside-pane', view.id)
          pane.setAttribute('aria-label', view.label)
          pane.tabIndex = 0
          tab.addEventListener('click', () => asideSetActive(view.id, aside, true))
          panes.append(pane)
          let dispose = null
          if (view.windowId && view.windowId !== 'site') {
            pane.textContent = `${view.label}已在独立窗口打开`
            pane.setAttribute('data-lsb-shell-window-proxy', view.windowId)
          } else {
            try {
              dispose = view.render(pane, context)
            } catch (e) {
              pane.textContent = 'AI 视图加载失败'
              console.error('[LSB skin] 右栏视图渲染失败', view.id, e)
            }
          }
          rec = { view, tab, pane, dispose: typeof dispose === 'function' ? dispose : null }
          asideViews.set(view.id, rec)
        }
        tabs.append(rec.tab)
        panes.append(rec.pane)
      }
      tabs.append(siteTab)
      // 站点页固定在首位；append 顺序用于浏览器键盘和读屏顺序。
      tabs.insertBefore(siteTab, tabs.firstChild)
      panes.insertBefore(site, panes.firstChild)
      tabs.hidden = !wide || visible.length === 0
      asideSetActive(wide ? asidePreferredId : 'site', aside)
    }

    function bindAsideResize() {
      if (asideResizeBound) return
      asideResizeBound = true
      window.addEventListener('resize', onAsideResize)
    }

    function unbindAsideResize() {
      if (!asideResizeBound) return
      window.removeEventListener('resize', onAsideResize)
      asideResizeBound = false
    }

    function onAsideResize() {
      if (cfg.shell) syncAsideViews()
    }

    // ── F: 插件特性与工具菜单（collectBoards/collectTools） ──
    // · F1 collectBoards: 版块清单与插件特性聚合 ──
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

    const PLUGIN_FEATURES = [
      { plugin: 'ai-summary', panel: 'ai-summary-history', label: 'AI 历史' },
      { plugin: 'checkin-calendar', panel: 'checkin-calendar', label: '签到日历' },
      { plugin: 'points-title-workbench', rpc: 'points-title-workbench:open', label: '积分-称号' },
      { plugin: 'annual-report', panel: 'annual-report', label: '年度报告' },
    ]

    function collectPluginFeatureEntries() {
      const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
      const info = w.LSB?.info?.() || {}
      const states = new Map((info.plugins || []).map((plugin) => [plugin.id, plugin.state]))
      const panelIds = new Set(api.ui.panels().map((panel) => panel.id))
      const handlers = new Set((info.handlers || []).map((handler) => handler.name))
      const settings = new Set(api.ui.settingsPlugins().map((plugin) => plugin.id))
      return PLUGIN_FEATURES
        .filter((item) => states.get(item.plugin) === 'active')
        .filter((item) => item.panel ? panelIds.has(item.panel) : handlers.has(item.rpc))
        .map((item) => ({ ...item, hasSettings: settings.has(item.plugin) }))
    }

    function collectPluginSettingsEntries() {
      return api.ui.settingsPlugins()
    }

    function renderPluginFeatureEntries() {
      const host = canvasSurface('plugin-features-sheet')?.querySelector('[data-plugin-feature-list]')
      if (!(host instanceof Element)) return
      host.replaceChildren()
      const entries = collectPluginFeatureEntries()
      if (!entries.length) {
        const empty = document.createElement('p')
        empty.className = 'lsb-empty'
        empty.textContent = '目前没有可用的插件功能。'
        host.append(empty)
        return
      }
      for (const entry of entries) {
        const row = document.createElement('div')
        row.className = 'lsb-plugin-entry'
        row.setAttribute('data-plugin-feature-entry', entry.plugin)
        const action = document.createElement('button')
        action.type = 'button'
        action.className = 'lsb-plugin-entry-main'
        action.setAttribute('data-plugin-feature-action', entry.plugin)
        action.textContent = entry.label
        row.append(action)
        if (entry.hasSettings) {
          const settings = document.createElement('button')
          settings.type = 'button'
          settings.className = 'lsb-plugin-entry-settings'
          settings.setAttribute('data-plugin-settings-open', entry.plugin)
          settings.setAttribute('aria-label', `打开${entry.label}设置`)
          settings.title = `${entry.label}设置`
          settings.textContent = '⚙'
          row.append(settings)
        }
        host.append(row)
      }
    }

    function pluginStateLabel(state) {
      if (state === 'disabled') return '已停用'
      if (state === 'skipped') return '当前页面未启用'
      if (state === 'error') return '异常'
      if (state === 'registered') return '等待启用'
      return ''
    }

    function renderPluginSettingsEntries() {
      const host = canvasSurface('plugin-settings-sheet')?.querySelector('[data-plugin-settings-list]')
      if (!(host instanceof Element)) return
      host.replaceChildren()
      const entries = collectPluginSettingsEntries()
      if (!entries.length) {
        const empty = document.createElement('p')
        empty.className = 'lsb-empty'
        empty.textContent = '没有声明配置项的插件。'
        host.append(empty)
        return
      }
      for (const entry of entries) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'lsb-plugin-settings-entry'
        button.setAttribute('data-plugin-settings-entry', entry.id)
        const name = document.createElement('span')
        name.textContent = entry.name || entry.id
        button.append(name)
        const state = pluginStateLabel(entry.state)
        if (state) {
          const status = document.createElement('small')
          status.textContent = state
          button.append(status)
        }
        host.append(button)
      }
    }

    // · F2 collectTools/invalidateTools: 工具菜单（入口与失效） ──
    function collectTools() {
      if (toolsCache) return toolsCache
      const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
      const active = new Set(
        (w.LSB?.info?.().plugins || []).filter((p) => p.state === 'active').map((p) => p.id),
      )
      toolsCache = PLUGIN_FEATURES
        .filter((tool) => active.has(tool.plugin))
        .map(({ panel, rpc, label }) => (rpc ? { rpc, label } : { panel, label }))
      return toolsCache
    }

    function invalidateTools() {
      toolsCache = null
    }

    // ── G: 导航与搜索（pagePath/shellSearchHost/adoptSearch） ──
    // · G1 pagePath/locationText/isActiveHref: 当前路径与站点文案 ──
    function pagePath() {
      try {
        return location.pathname.replace(/\/+$/, '') || '/'
      } catch {
        return ''
      }
    }

    function locationText() {
      const p = api.page || {}
      const path = pagePath()
      const type = p.type
      if (type === 'collections' || path === '/topic_collections') {
        let tab = type === 'collections' ? p.tab : null
        if (tab == null) {
          try {
            tab = new URL(location.href).searchParams.get('tab')
          } catch {
            tab = null
          }
        }
        return tab === 'mine' || !tab ? '我的淘帖' : '淘帖中心'
      }
      if (type === 'collection' || /^\/topic_collection\/\d+$/.test(path)) {
        const title = (document.querySelector('h1.post-content-title, h1')?.textContent || '').trim()
        return title || '淘帖'
      }
      if (type === 'identity' || path === '/identity_center') return '认证中心'
      if (type === 'promotions' || path === '/promotions') return '我的广告'
      if (type === 'messages' || path === '/direct_messages') return '我的私信'
      if (type === 'user_block' || path === '/user_block') return '屏蔽名单'
      if (type === 'essence_review' || path === '/topic_essence_review_list') return '申精'
      if (type === 'home' || path === '/' || path === '/index.php') {
        if (path === '/' || path === '/index.php') {
          if (p.sort === 'lucky') return '抽奖'
          if (p.sort === 'card') return '发卡'
          if (p.sort === 'red_packet') return '红包'
          if (p.sort === 'comment') return '新评论'
          return '新帖子'
        }
      }
      if (type === 'forum') {
        const f = (api.forums || []).find((x) => x.id === p.id)
        return f?.name || '版块'
      }
      if (type === 'topic') {
        try {
          const title = api.parse.topic(document)?.title
          if (title) return title
        } catch {
          /* 解析失败则读标题节点 */
        }
        return (document.querySelector('h1.post-content-title')?.textContent || '').trim() || '帖子'
      }
      if (type === 'user') return '用户'
      if (type === 'featured') return '精华'
      if (type === 'hot_discussions' || path === '/hot_discussions') return '热议'
      if (type === 'footprint') return '足迹'
      if (type === 'gacha') return '称号抽取'
      if (type === 'gacha_market') return '称号交易'
      if (type === 'gacha_profile') return '我的称号'
      if (type === 'wallet') return '我的烧饼'
      if (type === 'invite') return '邀请中心'
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

    // · G2 shellSearchHost/adoptSearch/restoreSearch: 搜索框接管 ──
    function shellSearchHost() {
      return document.querySelector('#lsb-shell [data-canvas-search-host]') || document.querySelector('.lsb-shell-search-host')
    }

    function adoptSearch(host) {
      if (!(host instanceof Element)) return
      const canvasHost = host.matches('[data-canvas-search-host]')
      const panel = canvasHost ? host.querySelector('[data-canvas-search-panel]') : host
      if (!(panel instanceof Element)) return
      const hostedForm = panel.querySelector(SEARCH_FORM_SELECTOR)
      if (hostedForm) {
        hostedForm.classList.add('lsb-shell-search')
        if (canvasHost) host.hidden = false
        return
      }
      const nativeForm = document.querySelector(TOP_SEARCH_FORM_SELECTOR) || document.querySelector(SEARCH_FORM_SELECTOR)
      if (nativeForm && !panel.contains(nativeForm)) {
        const fallback = panel.querySelector('a.search-page-link')
        if (fallback) {
          fallback.classList.remove('lsb-shell-search')
          fallback.remove()
        }
        searchHome = { parent: nativeForm.parentNode, next: nativeForm.nextSibling }
        nativeForm.classList.add('lsb-shell-search')
        panel.append(nativeForm)
        if (canvasHost) host.hidden = false
        return
      }
      const adoptedLink = panel.querySelector('a.search-page-link')
      if (adoptedLink) {
        if (canvasHost) host.hidden = false
        return
      }
      const el =
        document.querySelector('body > .top .search-page-link') ||
        document.querySelector('a.search-page-link')
      if (!(el instanceof Element) || host.contains(el)) {
        if (canvasHost) host.hidden = true
        return
      }
      searchHome = { parent: el.parentNode, next: el.nextSibling }
      el.classList.add('lsb-shell-search')
      panel.append(el)
      if (canvasHost) host.hidden = false
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
      for (const card of document.querySelectorAll('.sidebar-card.user-card')) {
        if (host?.contains(card)) continue
        if (!isSelfUserCard(card)) continue
        return card
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
      const userPageProfile = api.page?.type === 'user' && host.hasAttribute('data-lsb-canvas-profile')
      const incoming = userPageProfile ? null : findIncomingSelfCard(host)
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
      let card = findNativeUserCard()
      if (userPageProfile) {
        card = nativeSidebars()
          .flatMap((side) => [...side.querySelectorAll('.sidebar-card.user-card')])
          .find((candidate) => !host.contains(candidate) && !isSelfUserCard(candidate)) || card
      }
      if (!(card instanceof Element) || host.contains(card) || (!userPageProfile && !isSelfUserCard(card))) return
      userCardHome = { parent: card.parentNode, next: card.nextSibling }
      card.classList.add('lsb-shell-user-card')
      host.append(card)
    }

    function restoreUserCard() {
      const card = document.querySelector('.lsb-shell-user-card')
      restoreNode(card, userCardHome, 'lsb-shell-user-card')
      userCardHome = null
    }

    function canvasProfileSetExpanded(host, expanded, locked = canvasSelfProfileLocked) {
      if (!(host instanceof Element)) return
      const next = !!expanded
      host.dataset.expanded = String(next)
      host.dataset.locked = String(!!locked)
      const button = host.querySelector('[data-canvas-profile-expand]')
      if (button instanceof HTMLElement) {
        button.setAttribute('aria-expanded', String(next))
        button.textContent = next ? '⌃' : '⌄'
        button.setAttribute('title', next ? (locked ? '收起个人资料卡' : '个人资料卡已展开') : '展开个人资料卡')
      }
    }

    function canvasBindSelfProfile(host) {
      if (!(host instanceof Element) || host.dataset.canvasProfileBound === '1') return
      host.dataset.canvasProfileBound = '1'
      host.addEventListener('mouseenter', () => {
        if (canvasViewport().width < 1100 || canvasSelfProfileLocked) return
        canvasProfileSetExpanded(host, true, false)
      })
      host.addEventListener('mouseleave', () => {
        if (canvasSelfProfileLocked) return
        canvasProfileSetExpanded(host, false, false)
      })
      host.addEventListener('focusout', (event) => {
        if (canvasSelfProfileLocked || host.contains(event.relatedTarget)) return
        canvasProfileSetExpanded(host, false, false)
      })
      const button = host.querySelector('[data-canvas-profile-expand]')
      button?.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        const next = !canvasSelfProfileLocked
        canvasSelfProfileLocked = next
        canvasProfileSetExpanded(host, next, canvasSelfProfileLocked)
      })
    }

    function canvasPrepareSelfProfileCard(card) {
      if (!(card instanceof Element)) return
      card.classList.add('lsb-canvas-self-user-card')
      card.id = 'lsb-canvas-self-profile-card'
      const host = card.closest('[data-canvas-profile-host]')
      host?.querySelector('[data-canvas-profile-expand]')?.setAttribute('aria-controls', card.id)
      const bell = [...card.querySelectorAll('a[href]')].find((a) => {
        const href = a.getAttribute('href') || ''
        return /[?&]tab=notifications(?:&|$)/.test(href)
      })
      if (bell) {
        bell.setAttribute('data-canvas-profile-bell', '')
        bell.setAttribute('aria-label', '我的通知')
        bell.setAttribute('title', '我的通知')
      }
    }

    function canvasMountSelfProfile() {
      const host = canvasSurfaceHost?.querySelector?.('[data-canvas-profile-host]')
      if (!(host instanceof Element)) return null
      canvasSelfProfileHost = host
      canvasBindSelfProfile(host)
      let card = host.querySelector('.sidebar-card.user-card')
      if (card instanceof Element) {
        canvasPrepareSelfProfileCard(card)
        host.hidden = false
        canvasSelfProfileLocked = false
        canvasProfileSetExpanded(host, false, false)
        return host
      }
      if (!(card instanceof Element)) {
        card = document.querySelector('.lsb-canvas-self-user-card')
      }
      if (!(card instanceof Element)) {
        card = findIncomingSelfCard(host) || findNativeUserCard()
      }
      if (!(card instanceof Element) || host.contains(card) || !isSelfUserCard(card)) {
        host.hidden = true
        canvasSelfProfileLocked = false
        canvasProfileSetExpanded(host, false, false)
        return host
      }
      if (!canvasSelfProfileHome) canvasSelfProfileHome = { parent: card.parentNode, next: card.nextSibling }
      canvasPrepareSelfProfileCard(card)
      host.append(card)
      host.hidden = false
      canvasSelfProfileLocked = false
      canvasProfileSetExpanded(host, false, false)
      return host
    }

    function canvasRestoreSelfProfile() {
      const card = document.querySelector('.lsb-canvas-self-user-card')
      restoreNode(card, canvasSelfProfileHome, 'lsb-canvas-self-user-card')
      canvasSelfProfileHome = null
      canvasSelfProfileLocked = false
      if (canvasSelfProfileHost) {
        canvasSelfProfileHost.hidden = true
        canvasSelfProfileHost.removeAttribute('data-expanded')
        canvasSelfProfileHost.removeAttribute('data-locked')
      }
      canvasSelfProfileHost = null
    }

    function canvasProfileSlotFor(outlet) {
      if (!(outlet instanceof Element)) return null
      let slot = [...outlet.children].find((node) => node.getAttribute?.('data-canvas-profile-slot') === 'true')
      if (!(slot instanceof Element)) {
        slot = document.createElement('div')
        slot.setAttribute('data-canvas-profile-slot', 'true')
        slot.setAttribute('aria-label', '个人信息')
        outlet.insertBefore(slot, outlet.firstChild)
      } else if (slot !== outlet.firstElementChild) {
        outlet.insertBefore(slot, outlet.firstChild)
      }
      return slot
    }

    function canvasRestoreProfile() {
      canvasRestoreSelfProfile()
      restoreUserCard()
      if (canvasListSurface) canvasListSurface.removeAttribute('data-lsb-canvas-list')
      canvasListSurface = null
      canvasListHome = null
      canvasProfileExpanded = false
      canvasProfileScrollMode = 'full'
      canvasProfileSlot?.remove()
      canvasProfileSlot = null
      canvasProfileOutlet = null
    }

    function canvasUserListSurface(outlet) {
      if (!(outlet instanceof Element) || api.page?.type !== 'user') return null
      const direct = [...outlet.children].find((node) => node.matches?.('.home-shell, .forum-layout, .forum-main, .main-panel'))
      const list = direct || outlet.querySelector('.home-shell, .forum-layout, .forum-main, .main-panel')
      if (!(list instanceof Element)) return null
      if (canvasListSurface && canvasListSurface !== list) canvasListSurface.removeAttribute('data-lsb-canvas-list')
      if (!canvasListHome) canvasListHome = { node: list, parent: list.parentNode, next: list.nextSibling }
      list.setAttribute('data-lsb-canvas-list', '')
      canvasListSurface = list
      return list
    }

    function canvasApplyUserSurfaceState(outlet, slot) {
      if (!(slot instanceof Element) || api.page?.type !== 'user') return
      canvasProfileExpanded = false
      canvasProfileScrollMode = 'full'
      slot.setAttribute('data-lsb-canvas-profile', '')
      slot.dataset.scrollMode = canvasProfileScrollMode
      slot.dataset.expanded = String(canvasProfileExpanded)
      canvasUserListSurface(outlet)
    }

    function canvasMountProfile(outlet) {
      if (!(outlet instanceof Element)) return null
      if (canvasProfileOutlet && canvasProfileOutlet !== outlet) canvasRestoreProfile()
      canvasMountSelfProfile()
      canvasProfileOutlet = outlet
      if (api.page?.type !== 'user') return canvasSelfProfileHost
      const slot = canvasProfileSlotFor(outlet)
      if (!(slot instanceof Element)) return null
      canvasProfileSlot = slot
      slot.setAttribute('data-lsb-canvas-profile', '')
      adoptUserCard(slot)
      if (!slot.querySelector('.sidebar-card.user-card')) {
        slot.hidden = true
      } else {
        slot.hidden = false
        canvasApplyUserSurfaceState(outlet, slot)
      }
      return slot
    }

    function canvasPersistentSiteCardKind(card) {
      if (!(card instanceof Element)) return ''
      if (card.matches('.sidebar-promotions-card')) return 'promotions'
      if (card.matches('.daily-hot-topics-card')) return 'daily-hot-topics'
      return ''
    }

    function canvasEnsurePersistentSiteCard(card) {
      const kind = canvasPersistentSiteCardKind(card)
      if (!kind) return null
      let record = canvasPersistentSiteCards.get(kind)
      if (!record) {
        const parent = card.parentNode
        const placeholder = document.createComment(`lsb-canvas-${kind}-origin`)
        parent?.insertBefore(placeholder, card)
        record = { node: card, placeholder, originalParent: parent, originalNext: card.nextSibling }
        canvasPersistentSiteCards.set(kind, record)
      }
      return record
    }

    function canvasAdoptRebuiltPersistentSiteCard(kind, card) {
      const record = canvasPersistentSiteCards.get(kind)
      const parent = card?.parentNode
      if (!record || record.node?.isConnected || !parent) return false
      const placeholder = document.createComment(`lsb-canvas-${kind}-origin`)
      const originalNext = card.nextSibling
      parent.insertBefore(placeholder, card)
      canvasSiteSidebarHomes.delete(record.node)
      record.node = card
      record.placeholder = placeholder
      record.originalParent = parent
      record.originalNext = originalNext
      return true
    }

    function canvasRestorePersistentSiteCard(kind, record, { release = true } = {}) {
      if (!record?.node) return
      const { node, placeholder, originalParent, originalNext } = record
      const placeholderParent = placeholder?.parentNode
      const connectedParent = placeholderParent?.isConnected
        ? placeholderParent
        : (originalParent?.isConnected ? originalParent : nativeSidebars().find((side) => side.isConnected))
      if (connectedParent && placeholderParent === connectedParent) {
        connectedParent.replaceChild(node, placeholder)
      } else if (connectedParent) {
        const before = originalNext?.parentNode === connectedParent ? originalNext : null
        connectedParent.insertBefore(node, before)
      } else if (originalParent?.isConnected) {
        const before = originalNext?.parentNode === originalParent ? originalNext : null
        originalParent.insertBefore(node, before)
      } else if (!node.parentNode?.isConnected) {
        node.remove()
      }
      node.classList.remove('lsb-canvas-site-card')
      if (release) canvasPersistentSiteCards.delete(kind)
      canvasSiteSidebarHomes.delete(node)
    }

    function canvasStagePersistentSiteCardOrigins(remoteOutlet) {
      if (!(remoteOutlet instanceof Element)) return
      for (const [kind] of canvasPersistentSiteCards) {
        const remotes = [...remoteOutlet.querySelectorAll('.sidebar-promotions-card, .daily-hot-topics-card')]
          .filter((card) => canvasPersistentSiteCardKind(card) === kind)
        for (const remote of remotes) {
          const marker = remote.ownerDocument.createElement('span')
          marker.hidden = true
          marker.dataset.lsbCanvasSiteOrigin = kind
          marker.setAttribute('aria-hidden', 'true')
          remote.replaceWith(marker)
        }
      }
    }

    function canvasRebindPersistentSiteCardOrigins(routeOutlet) {
      if (!routeOutlet?.querySelector) return
      for (const [kind, record] of canvasPersistentSiteCards) {
        const marker = routeOutlet.querySelector(`[data-lsb-canvas-site-origin="${kind}"]`)
        if (!marker) continue
        record.placeholder = marker
        record.originalParent = marker.parentNode
        record.originalNext = marker.nextSibling
      }
    }

    function canvasRestoreSiteSidebar({ releasePersistent = false, restorePersistent = false } = {}) {
      const persistentByNode = new Map(
        [...canvasPersistentSiteCards].map(([kind, record]) => [record.node, { kind, record }]),
      )
      for (const [card, home] of [...canvasSiteSidebarHomes]) {
        const persistent = persistentByNode.get(card)
        if (persistent && !releasePersistent) continue
        if (persistent) canvasRestorePersistentSiteCard(persistent.kind, persistent.record, { release: releasePersistent })
        else restoreNode(card, home, 'lsb-canvas-site-card')
        canvasSiteSidebarHomes.delete(card)
      }
      if (restorePersistent && !releasePersistent) {
        for (const [kind, record] of canvasPersistentSiteCards) {
          canvasRestorePersistentSiteCard(kind, record, { release: false })
        }
      }
      if (releasePersistent) {
        for (const [kind, record] of [...canvasPersistentSiteCards]) {
          canvasRestorePersistentSiteCard(kind, record, { release: true })
        }
      }
      for (const card of [...(canvasSiteSidebarHost?.querySelectorAll?.(':scope > .sidebar-card') || [])]) {
        if (!releasePersistent && persistentByNode.has(card)) continue
        card.remove()
      }
      if (releasePersistent) canvasPersistentSiteCards.clear()
      canvasSiteSidebarHost = null
      canvasSiteStatusHost = null
      canvasSiteStatusLocked = false
    }

    function canvasPromotionNeedsNativeInitialization(card) {
      if (!(card instanceof Element) || !card.matches('.sidebar-promotions-card')) return false
      const links = [...card.querySelectorAll('[data-sidebar-promotions-ad-link="1"]')]
      const textLinks = links.filter((link) =>
        link.matches('.sidebar-promotions-slot-text, [data-sidebar-promotions-lottery-slot="1"]')
        || (!link.matches('.sidebar-promotions-slot-image') && !link.querySelector('img')),
      )
      if (!textLinks.length) return false
      return textLinks.some((link) => {
        const style = link.getAttribute('style') || ''
        return !/--sidebar-promotion-text\s*:/.test(style)
          || !/--sidebar-promotion-background\s*:/.test(style)
      })
    }

    function canvasNativeSiteCards() {
      const cards = []
      const emittedPersistentKinds = new Set()
      for (const side of nativeSidebars()) {
        for (const card of [...side.children].filter((node) => node.matches?.('.sidebar-card'))) {
          if (card.classList.contains('user-card')) continue
          if (card.classList.contains('mobile-menu-drawer')) continue
          const kind = canvasPersistentSiteCardKind(card)
          if (kind) {
            const existing = canvasPersistentSiteCards.get(kind)
            if (existing && existing.node !== card) {
              if (existing.node?.isConnected) {
                if (canvasPromotionNeedsNativeInitialization(card)) card.remove()
                else cards.push(card)
                continue
              }
              if (canvasPromotionNeedsNativeInitialization(card)) {
                card.remove()
                continue
              }
              canvasAdoptRebuiltPersistentSiteCard(kind, card)
            }
            const record = canvasEnsurePersistentSiteCard(card)
            if (!record) continue
            if (!emittedPersistentKinds.has(kind)) {
              cards.push(record.node)
              emittedPersistentKinds.add(kind)
            }
            continue
          }
          cards.push(card)
        }
      }
      for (const [kind, record] of canvasPersistentSiteCards) {
        if (record.node.isConnected && !emittedPersistentKinds.has(kind)) cards.push(record.node)
      }
      return cards
    }

    function canvasSiteStatusBody() {
      return canvasSurface('site-status')?.querySelector('[data-canvas-site-status-body]') || null
    }

    function canvasSiteStatusSetExpanded(host, expanded, locked = canvasSiteStatusLocked) {
      if (!(host instanceof Element)) return
      const next = !!expanded
      canvasSiteStatusLocked = !!locked
      host.dataset.expanded = String(next)
      host.dataset.locked = String(canvasSiteStatusLocked)
      const button = host.querySelector('[data-canvas-site-status-expand]')
      const label = host.querySelector('[data-canvas-site-status-label]')
      if (label instanceof HTMLElement) label.setAttribute('aria-expanded', String(next))
      if (button instanceof HTMLElement) {
        button.setAttribute('aria-expanded', String(next))
        button.textContent = next ? '⌃' : '⌄'
        button.setAttribute('title', next ? '收起站点信息' : '展开站点信息')
        button.setAttribute('aria-label', next ? '收起站点信息' : '展开站点信息')
      }
    }

    function canvasSyncPersistentSiteCards(surface = canvasSurface('site-card')) {
      const statusSurface = canvasSurface('site-status')
      const statusHost = statusSurface?.querySelector('[data-canvas-site-status-host]')
      const useStatusHost = canvasWidthClass === 'wide' && statusHost instanceof Element
      const host = useStatusHost ? canvasSiteStatusBody() : surface?.querySelector?.('[data-canvas-site-sidebar]')
      if (!(host instanceof Element)) return
      canvasSiteSidebarHost = host
      canvasSiteStatusHost = useStatusHost ? statusHost : null
      const cards = []
      const emitted = new Set()
      for (const side of nativeSidebars()) {
        for (const card of [...side.children].filter((node) => node.matches?.('.sidebar-card'))) {
          const kind = canvasPersistentSiteCardKind(card)
          if (!kind) continue
          const existing = canvasPersistentSiteCards.get(kind)
          if (existing && existing.node !== card) {
            if (existing.node?.isConnected) {
              if (canvasPromotionNeedsNativeInitialization(card)) card.remove()
              continue
            }
            if (canvasPromotionNeedsNativeInitialization(card)) {
              card.remove()
              continue
            }
            canvasAdoptRebuiltPersistentSiteCard(kind, card)
          }
          const record = canvasEnsurePersistentSiteCard(card)
          if (record && !emitted.has(kind)) {
            cards.push(record.node)
            emitted.add(kind)
          }
        }
      }
      for (const [kind, record] of canvasPersistentSiteCards) {
        if (record.node.isConnected && !emitted.has(kind)) cards.push(record.node)
      }
      for (const card of cards) {
        if (host.contains(card)) continue
        card.classList.add('lsb-canvas-site-card')
        host.append(card)
      }
      const empty = host.querySelector('[data-canvas-site-empty-state]')
      if (empty instanceof HTMLElement) empty.hidden = cards.length > 0
    }

    function canvasSyncSiteSidebar(surface = canvasSurface('site-card')) {
      const statusSurface = canvasSurface('site-status')
      const statusHost = statusSurface?.querySelector('[data-canvas-site-status-host]')
      const useStatusHost = canvasWidthClass === 'wide' && statusHost instanceof Element
      const host = useStatusHost ? canvasSiteStatusBody() : surface?.querySelector?.('[data-canvas-site-sidebar]')
      if (!(host instanceof Element)) return
      canvasSiteSidebarHost = host
      canvasSiteStatusHost = useStatusHost ? statusHost : null
      if (statusSurface instanceof HTMLElement) statusSurface.hidden = !useStatusHost
      if (statusHost instanceof HTMLElement) {
        statusHost.hidden = !useStatusHost
        if (!useStatusHost) canvasSiteStatusSetExpanded(statusHost, false, false)
      }
      const cards = canvasNativeSiteCards()
      const current = new Set(cards)
      const persistentNodes = new Set(
        [...canvasPersistentSiteCards.values()].map((record) => record.node),
      )
      for (const [card] of [...canvasSiteSidebarHomes]) {
        if (!card.isConnected) canvasSiteSidebarHomes.delete(card)
      }
      for (const card of [...host.children].filter((node) => node.matches?.('.sidebar-card'))) {
        if (persistentNodes.has(card) || current.has(card) || canvasSiteSidebarHomes.has(card)) continue
        const home = canvasSiteSidebarHomes.get(card)
        if (home) {
          restoreNode(card, home, 'lsb-canvas-site-card')
          canvasSiteSidebarHomes.delete(card)
        } else {
          card.remove()
        }
      }
      for (const card of cards) {
        if (host.contains(card)) continue
        if (!persistentNodes.has(card) && !canvasSiteSidebarHomes.has(card)) {
          canvasSiteSidebarHomes.set(card, { parent: card.parentNode, next: card.nextSibling })
        }
        card.classList.add('lsb-canvas-site-card')
        host.append(card)
      }
      const empty = host.querySelector('[data-canvas-site-empty-state]')
      if (empty instanceof HTMLElement) {
        const mounted = host.querySelectorAll(':scope > .sidebar-card').length
        empty.hidden = cards.length > 0 || mounted > 0
      }
    }

    function canvasBindSiteStatus(host) {
      if (!(host instanceof Element) || host.dataset.canvasSiteStatusBound === '1') return
      host.dataset.canvasSiteStatusBound = '1'
      canvasSiteStatusSetExpanded(host, false, false)
    }

    function canvasOpenSiteStatus(trigger = null) {
      const host = canvasSurface('site-status')?.querySelector('[data-canvas-site-status-host]')
      if (!(host instanceof Element)) return null
      if (canvasActiveSheet && canvasActiveSheet !== 'site-card') canvasCloseSurface(canvasActiveSheet, false)
      canvasFocusReturn = trigger instanceof Element
        ? trigger
        : (document.activeElement instanceof Element ? document.activeElement : null)
      canvasSyncSiteSidebar()
      host.hidden = false
      canvasSiteStatusSetExpanded(host, true, true)
      canvasActiveSheet = 'site-card'
      canvasSetBackdrop(false)
      canvasZIndex += 1
      host.style.zIndex = String(8010 + canvasZIndex)
      return host
    }

    function canvasWatchSidebar() {
      canvasSidebarObserver?.disconnect?.()
      canvasSidebarObserver = null
      const sides = nativeSidebars()
      if (!sides.length || typeof MutationObserver !== 'function') return
      canvasSidebarObserver = new MutationObserver(() => {
        if (!cfg.shell) return
        canvasMountProfile(findRouteOutlet())
        const site = canvasSurface('site-card')
        canvasSyncPersistentSiteCards(site)
        if (canvasActiveSheet === 'site-card' || site?.dataset.surfaceMode === 'rail') canvasSyncSiteSidebar(site)
      })
      for (const side of sides) canvasSidebarObserver.observe(side, { childList: true, subtree: true })
    }

    function canvasStopSidebarWatch() {
      canvasSidebarObserver?.disconnect?.()
      canvasSidebarObserver = null
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

    function isAiConsoleExtra(node, href = '', label = '') {
      if (node?.classList?.contains('lsb-ai-console-top')) return true
      const name = String(label || extraLabel(node) || node?.textContent || '').replace(/\s+/g, ' ')
      return /AI\s*操作台/.test(name)
    }

    function collectTopExtras() {
      const top = document.querySelector('body > .top')
      if (!top) return []
      const seen = new Set()
      const out = []
      const take = (a) => {
        if (!(a instanceof HTMLAnchorElement)) return
        const label = extraLabel(a)
        if (!label || isAiConsoleExtra(a, a.href, label) || isJunkExtra(a.href, label)) return
        let abs
        try {
          abs = new URL(a.href, location.href).href
        } catch {
          return
        }
        if (seen.has(abs)) return
        seen.add(abs)
        out.push(a)
      }
      for (const a of top.querySelectorAll('a.forum-enhancements-custom-top-link')) take(a)
      for (const a of top.querySelectorAll('a.plugin-top-menu-link')) take(a)
      return out
    }

    function collectCanvasTopLinks() {
      const out = []
      const seen = new Set()
      const add = (node, fallback = {}) => {
        if (node?.classList?.contains('lsb-ai-console-top') || node?.classList?.contains('lsb-ai-copilot-top')) return
        const href = node?.getAttribute?.('href') || fallback.url || ''
        const label = extraLabel(node) || String(node?.textContent || fallback.name || '').replace(/\s+/g, ' ').trim()
        if (!href || !label || isJunkExtra(href, label)) return
        let absolute
        try { absolute = new URL(href, location.href).href } catch { return }
        if (seen.has(absolute)) return
        seen.add(absolute)
        out.push({
          node: node instanceof HTMLAnchorElement ? node : null,
          href: node?.getAttribute?.('href') || fallback.url || href,
          label,
          target: node?.getAttribute?.('target') || (fallback.new_window ? '_blank' : ''),
          rel: node?.getAttribute?.('rel') || '',
        })
      }
      const top = document.querySelector('body > .top')
      top?.querySelectorAll('a.forum-enhancements-custom-top-link, a.plugin-top-menu-link').forEach((node) => add(node))
      top?.querySelectorAll('a.forum-enhancements-custom-top-link, a.plugin-top-menu-link').forEach((node) => add(node))
      const configNode = document.querySelector('.forum-enhancements-config')
      if (configNode) {
        try {
          const config = JSON.parse(configNode.getAttribute('data-config') || '{}')
          for (const item of Array.isArray(config.topCustomLinks) ? config.topCustomLinks : []) add(null, item)
        } catch {
          /* optional enhancement config may be malformed */
        }
      }
      document.querySelectorAll('.feature-links a, .mobile-menu-section a.mobile-menu-link').forEach((node) => add(node))
      for (const item of api.store.get('topExtras') || []) add(null, item)
      return out
    }

    function restoreCanvasTopLinks() {
      for (const [node, home] of canvasStatusLinkHomes) restoreNode(node, home, 'lsb-canvas-status-link')
      canvasStatusLinkHomes.clear()
    }

    function renderCanvasTopLinks() {
      const host = canvasSurface('top-status')?.querySelector('[data-canvas-status-links]')
      const pinnedLinks = canvasSurface('top-status')?.querySelector('[data-canvas-pinned-links]')
      if (!(host instanceof Element) || !(pinnedLinks instanceof Element)) return
      restoreCanvasTopLinks()
      host.replaceChildren()
      pinnedLinks.replaceChildren()
      const items = collectCanvasTopLinks()
      const visibleItems = canvasWidthClass === 'narrow' ? items.slice(0, 4) : items
      const makeNavigationTrigger = () => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'lsb-canvas-navigation-trigger'
        button.setAttribute('data-canvas-open', 'navigation-sheet')
        button.setAttribute('data-canvas-navigation-trigger', '')
        button.setAttribute('aria-label', '导航')
        button.textContent = '导航'
        return button
      }
      let identityLink = null
      for (const item of visibleItems) {
        let link = item.node
        if (!(link instanceof HTMLAnchorElement)) {
          link = document.createElement('a')
          link.href = item.href
          link.textContent = item.label
          if (item.target) link.target = item.target
          if (item.rel) link.rel = item.rel
        }
        if (host.contains(link) || pinnedLinks.contains(link)) continue
        if (link.parentNode) canvasStatusLinkHomes.set(link, { parent: link.parentNode, next: link.nextSibling })
        link.classList.add('lsb-canvas-status-link')
        link.setAttribute('data-lsb-canvas-status-link', '')
        let identityPath = ''
        try { identityPath = new URL(item.href, location.href).pathname.replace(/\/+$/, '') } catch { /* malformed optional link */ }
        if (!identityLink && (identityPath === '/identity_center' || item.label === '认证中心')) {
          identityLink = link
          pinnedLinks.append(link)
        } else {
          host.append(link)
        }
      }
      pinnedLinks.append(makeNavigationTrigger())
      host.hidden = host.children.length === 0
    }

    function adoptTopExtras(host) {
      if (!(host instanceof Element)) return
      for (const a of [...host.querySelectorAll('a[href]')]) {
        const label = extraLabel(a) || (a.textContent || '').trim()
        if (!isAiConsoleExtra(a, a.href, label) && !isJunkExtra(a.href, label)) continue
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
        if (node.matches('a[href]') && (isAiConsoleExtra(node, node.getAttribute('href'), label) || isJunkExtra(node.getAttribute('href'), label))) {
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
        .filter((x) => x.href && x.label && !isAiConsoleExtra(null, x.href, x.label) && !isJunkExtra(x.href, x.label))
      if (links.length) api.store.set('topExtras', links)
    }

    function hydrateTopExtras(host, have) {
      if (!(host instanceof Element)) return
      const known = have || new Set([...host.querySelectorAll('a[href]')].map((a) => a.href))
      for (const item of api.store.get('topExtras') || []) {
        if (!item?.href || !item.label || isAiConsoleExtra(null, item.href, item.label) || isJunkExtra(item.href, item.label)) continue
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
      const modal = document.querySelector('#color-scheme-modal')
      if (modal instanceof Element && modal.parentNode !== document.body) {
        if (!colorSchemeModalHome) colorSchemeModalHome = { parent: modal.parentNode, next: modal.nextSibling }
        modal.classList.add('lsb-shell-theme-modal')
        document.body.append(modal)
      }
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
      const modal = document.querySelector('.lsb-shell-theme-modal')
      if (modal instanceof Element && colorSchemeModalHome) {
        restoreNode(modal, colorSchemeModalHome, 'lsb-shell-theme-modal')
      } else {
        modal?.classList.remove('lsb-shell-theme-modal')
      }
      colorSchemeModalHome = null
    }

    function nativeCards() {
      return nativeSidebars().flatMap((side) => [...side.querySelectorAll('.sidebar-card')])
    }

    function asidePersistentCardKind(card) {
      if (!(card instanceof Element)) return ''
      if (card.matches('.sidebar-promotions-card')) return 'promotions'
      if (card.matches('.daily-hot-topics-card')) return 'daily-hot-topics'
      return ''
    }

    function ensureAsidePersistentCard(card) {
      const kind = asidePersistentCardKind(card)
      if (!kind) return null
      const existing = asidePersistentCards.get(kind)
      if (existing?.node?.isConnected) return existing
      const parent = card.parentNode
      const record = { node: card, originalParent: parent, originalNext: card.nextSibling }
      asidePersistentCards.set(kind, record)
      return record
    }

    function removeRebuiltAsidePersistentCards() {
      for (const [kind, record] of asidePersistentCards) {
        for (const card of nativeCards()) {
          if (card !== record.node && asidePersistentCardKind(card) === kind) card.remove()
        }
      }
    }

    function restoreAsidePersistentCards() {
      for (const [kind, record] of [...asidePersistentCards]) {
        const node = record?.node
        if (!(node instanceof Element)) {
          asidePersistentCards.delete(kind)
          continue
        }
        const parent = record.originalParent?.isConnected
          ? record.originalParent
          : nativeSidebars().find((side) => side.isConnected)
        if (!(parent instanceof Element)) continue
        const before = record.originalNext?.parentNode === parent ? record.originalNext : null
        parent.insertBefore(node, before)
        node.classList.remove('lsb-shell-aside-card')
        asidePersistentCards.delete(kind)
      }
    }

    function pickAsideCards() {
      const persistent = [...asidePersistentCards.values()]
        .map((record) => record.node)
        .filter((node) => node?.isConnected)
      const hosted = [...document.querySelectorAll('#lsb-shell-aside .sidebar-card')]
      const all = [...persistent, ...hosted, ...nativeCards()]
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
      const promo = uniq.find((c) => c.classList.contains('sidebar-promotions-card'))
      const announce = uniq.find(
        (c) => c.classList.contains('forum-enhancements-left-announcements') || text(c).startsWith('站务公告'),
      )
      const quick = uniq.find((c) => text(c).startsWith('快捷功能'))
      const hot = uniq.find((c) => c.classList.contains('daily-hot-topics-card'))
      const stats = uniq.find((c) => c.classList.contains('stats-card'))
      const online = uniq.find((c) => c.classList.contains('online-users-card'))
      return [profile, bio, promo, announce, quick, hot, stats, online].filter(Boolean)
    }

    function adoptAsideCards(host) {
      if (!(host instanceof Element)) return
      for (const card of pickAsideCards()) {
        const kind = asidePersistentCardKind(card)
        if (kind) {
          const record = ensureAsidePersistentCard(card)
          if (record?.node !== card) {
            card.remove()
            continue
          }
          if (host.contains(card)) continue
        } else if (host.contains(card) || card.classList.contains('lsb-shell-user-card')) {
          continue
        } else {
          asideHomes.set(card, { parent: card.parentNode, next: card.nextSibling })
        }
        card.classList.add('lsb-shell-aside-card')
        host.append(card)
      }
      removeRebuiltAsidePersistentCards()
      hydrateAsideKeep(host)
      snapshotAsideKeep(host)
      if (onlineUsersBoot()) syncOnlineUserDots()
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

    function onlineUserIdFromHref(href) {
      const value = String(href || '')
      const pretty = value.match(/\/user\/(\d+)(?:[/?#]|$)/)
      if (pretty) return pretty[1]
      if (!/[?&]a=user(?:&|$)/.test(value)) return ''
      return value.match(/[?&]id=(\d+)(?:&|$)/)?.[1] || ''
    }

    function onlineUsersBoot(root = document) {
      if (!root?.querySelector) return null
      return root.querySelector('[data-online-users-ids]')
    }

    function syncOnlineUserDots() {
      const boot = onlineUsersBoot()
      if (!(boot instanceof Element)) return false
      const ids = new Set(String(boot.dataset.onlineUsersIds || '').split(',').map((id) => id.trim()).filter(Boolean))
      const label = boot.dataset.onlineUsersLabel || '在线'
      for (const img of document.querySelectorAll('img.avatar-img')) {
        const host = img.parentElement
        if (!(host instanceof Element)) continue
        const dot = host.querySelector(':scope > .online-users-dot')
        const marked = host.closest('[data-online-user-id]')
        const link = img.closest('a[href]')
        const uid = String(marked?.getAttribute('data-online-user-id') || (link ? onlineUserIdFromHref(link.getAttribute('href')) : '')).trim()
        if (uid && ids.has(uid)) {
          host.classList.add('online-users-host')
          if (dot) dot.title = label
          else {
            const next = document.createElement('span')
            next.className = 'online-users-dot'
            next.title = label
            host.append(next)
          }
        } else {
          dot?.remove()
          host.classList.remove('online-users-host')
        }
      }
      return true
    }

    function syncOnlineUserBoot(sourceDoc) {
      const source = onlineUsersBoot(sourceDoc)
      if (!(source instanceof Element)) return false
      let target = onlineUsersBoot()
      if (!(target instanceof Element)) {
        target = document.createElement('span')
        target.className = 'online-users-boot'
        target.hidden = true
        document.body?.append(target)
      }
      if (!(target instanceof Element)) return false
      target.dataset.onlineUsersIds = source.dataset.onlineUsersIds || ''
      target.dataset.onlineUsersLabel = source.dataset.onlineUsersLabel || '在线'
      const synced = syncOnlineUserDots()
      if (synced) onlineUserLastSyncAt = Date.now()
      return synced
    }

    function wantsOnlineUserRefresh() {
      return !!cfg.shell && !isCloudflareChallengeDocument(document)
    }

    function onlineUserRefreshPath() {
      const url = new URL('/', location.href)
      return `${url.pathname}${url.search}`
    }

    function stopOnlineUserRefresh() {
      if (onlineUserRefreshTimer) {
        window.clearTimeout(onlineUserRefreshTimer)
        onlineUserRefreshTimer = 0
      }
      onlineUserRefreshPending = false
      onlineUserRefreshAfterInflight = false
      onlineUserRefreshGeneration += 1
      if (onlineUserRefreshVisibilityBound) {
        document.removeEventListener('visibilitychange', onOnlineUserVisibilityChange)
        onlineUserRefreshVisibilityBound = false
      }
    }

    function scheduleOnlineUserRefresh(delay = ONLINE_USER_REFRESH_MS, force = false, bypassCooldown = false) {
      if (!wantsOnlineUserRefresh()) {
        stopOnlineUserRefresh()
        return
      }
      if (onlineUserRefreshTimer) {
        if (!force) return
        window.clearTimeout(onlineUserRefreshTimer)
        onlineUserRefreshTimer = 0
      }
      if (onlineUserRefreshInflight) {
        if (bypassCooldown) onlineUserRefreshAfterInflight = true
        return
      }
      const elapsed = onlineUserLastSyncAt ? Date.now() - onlineUserLastSyncAt : 0
      const notBefore = bypassCooldown || !onlineUserLastSyncAt
        ? 0
        : Math.max(0, ONLINE_USER_REFRESH_MS - Math.max(0, elapsed))
      const wait = Math.max(0, Number(delay) || 0, notBefore)
      onlineUserRefreshTimer = window.setTimeout(() => {
        onlineUserRefreshTimer = 0
        void refreshOnlineUsers()
      }, wait)
    }

    async function refreshOnlineUsers() {
      if (!wantsOnlineUserRefresh()) return
      if (document.visibilityState === 'hidden') {
        onlineUserRefreshPending = true
        return
      }
      onlineUserRefreshPending = false
      if (onlineUserRefreshInflight) return onlineUserRefreshInflight
      const generation = onlineUserRefreshGeneration
      const task = (async () => {
        try {
          const res = await api.net.raw(onlineUserRefreshPath(), {
            queue: false,
            timeout: 15000,
            retry: 0,
            headers: { 'cache-control': 'no-cache' },
          })
          if (generation !== onlineUserRefreshGeneration || !wantsOnlineUserRefresh() || !res.ok) return
          const sourceDoc = new DOMParser().parseFromString(res.text || '', 'text/html')
          if (syncOnlineUserBoot(sourceDoc)) onlineUserLastSyncAt = Date.now()
        } catch {
          /* 在线清单刷新失败时保留上一份清单，下一周期继续尝试。 */
        } finally {
          if (onlineUserRefreshInflight === task) onlineUserRefreshInflight = null
          const rerun = onlineUserRefreshAfterInflight
          onlineUserRefreshAfterInflight = false
          if (generation === onlineUserRefreshGeneration) {
            if (rerun) scheduleOnlineUserRefresh(0, true, true)
            else scheduleOnlineUserRefresh()
          }
        }
      })()
      onlineUserRefreshInflight = task
      return task
    }

    function onOnlineUserVisibilityChange() {
      if (document.visibilityState !== 'visible' || !onlineUserRefreshPending) return
      onlineUserRefreshPending = false
      void refreshOnlineUsers()
    }

    function startOnlineUserRefresh() {
      if (!wantsOnlineUserRefresh()) return
      if (!onlineUserRefreshVisibilityBound) {
        document.addEventListener('visibilitychange', onOnlineUserVisibilityChange)
        onlineUserRefreshVisibilityBound = true
      }
      scheduleOnlineUserRefresh()
    }

    function scheduleOnlineUserDots() {
      if (onlineAvatarTimer) return
      onlineAvatarTimer = window.setTimeout(() => {
        onlineAvatarTimer = 0
        syncOnlineUserDots()
      }, 50)
    }

    function watchOnlineUserDots() {
      if (onlineAvatarObs || !(document.body instanceof Element) || !cfg.shell) return
      onlineAvatarObs = new MutationObserver((records) => {
        const hasAvatar = records.some((record) => [...record.addedNodes].some((node) => (
          node instanceof Element && (node.matches('img.avatar-img') || !!node.querySelector('img.avatar-img'))
        )))
        if (hasAvatar) scheduleOnlineUserDots()
      })
      onlineAvatarObs.observe(document.body, { childList: true, subtree: true })
    }

    function stopOnlineUserDots() {
      onlineAvatarObs?.disconnect()
      onlineAvatarObs = null
      if (onlineAvatarTimer) {
        window.clearTimeout(onlineAvatarTimer)
        onlineAvatarTimer = 0
      }
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
      const doc = typeof document !== 'undefined' ? document : null
      const timeline = doc?.querySelector?.('#lsb-shell-timeline')
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
      const requestFrame = window.requestAnimationFrame
      timelineRaf = typeof requestFrame === 'function'
        ? requestFrame.call(window, updateTimeline)
        : window.setTimeout(updateTimeline, 16)
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

    function shellWindowEnabled() {
      return false
    }

    function shellWorkspace(el = document.getElementById('lsb-shell')) {
      return el?.querySelector?.('[data-lsb-shell-workspace]') || null
    }

    function shellViewport(workspace) {
      const width = Number(workspace?.clientWidth || window.innerWidth || document.documentElement?.clientWidth || 1)
      const height = Number(workspace?.clientHeight || (window.innerHeight || document.documentElement?.clientHeight || 1) - 48)
      return { width: Math.max(1, width), height: Math.max(1, height) }
    }

    function cssPixels(name, fallback) {
      try {
        const value = getComputedStyle(document.documentElement).getPropertyValue(name)
        const parsed = Number.parseFloat(value)
        return Number.isFinite(parsed) ? parsed : fallback
      } catch {
        return fallback
      }
    }

    function shellLayoutStorageKey(viewport = shellViewport(shellWorkspace())) {
      if (!shellLayoutApi) return ''
      const bucket = shellLayoutApi.widthBucket(viewport.width)
      return shellLayoutApi.layoutStorageKey(location.origin, bucket)
    }

    function readLegacyShellLayout() {
      return {
        header: cssPixels('--lsb-shell-header', 48),
        rail: cssPixels('--lsb-shell-rail', 240),
        aside: cssPixels('--lsb-shell-aside', 280),
        asideActiveId: asidePreferredId,
      }
    }

    function saveShellLayout({ immediate = false } = {}) {
      if (!shellWindowLayout || !shellLayoutKey || !shellLayoutApi) return null
      if (!immediate) {
        window.clearTimeout(shellLayoutSaveTimer)
        shellLayoutSaveTimer = window.setTimeout(() => {
          shellLayoutSaveTimer = 0
          saveShellLayout({ immediate: true })
        }, LAYOUT_SAVE_DEBOUNCE)
        return null
      }
      window.clearTimeout(shellLayoutSaveTimer)
      shellLayoutSaveTimer = 0
      const viewport = shellViewport(shellWorkspace())
      const clean = shellLayoutApi.sanitizeShellLayout(shellWindowLayout, {
        ...viewport,
        registry: shellWindowRegistry,
      })
      clean.updatedAt = Date.now()
      shellWindowLayout = clean
      try {
        api.store.set(shellLayoutKey, structuredCloneSafe(clean))
      } catch {
        /* 存储不可用时继续保留内存布局，不能阻塞壳。 */
      }
      return structuredCloneSafe(clean)
    }

    function loadShellLayout(viewport = shellViewport(shellWorkspace())) {
      if (!shellLayoutApi) return null
      const key = shellLayoutStorageKey(viewport)
      shellLayoutKey = key
      let stored = null
      try {
        stored = api.store.get(key, null)
      } catch {
        stored = null
      }
      if (stored && typeof stored === 'object' && stored.windows && typeof stored.windows === 'object') {
        const clean = shellLayoutApi.sanitizeShellLayout(stored, {
          ...viewport,
          registry: shellWindowRegistry,
        })
        if (Object.keys(clean.windows).length) return clean
      }

      let migrationVersion = 0
      try { migrationVersion = Number(api.store.get(LAYOUT_MIGRATION_KEY, 0)) || 0 } catch { migrationVersion = 0 }
      if (!stored && migrationVersion < LAYOUT_MIGRATION_VERSION) {
        const migrated = shellLayoutApi.migrateLegacyShellLayout({
          viewport,
          legacy: readLegacyShellLayout(),
          registry: shellWindowRegistry,
        })
        migrated.updatedAt = Date.now()
        try { api.store.set(LAYOUT_MIGRATION_KEY, LAYOUT_MIGRATION_VERSION) } catch { /* optional marker */ }
        return migrated
      }
      return shellLayoutApi.defaultShellLayout({ ...viewport, registry: shellWindowRegistry })
    }

    function ensureRegisteredShellLayout(layout, viewport) {
      if (!layout || !shellLayoutApi) return layout
      const defaults = shellLayoutApi.defaultShellLayout({ ...viewport, registry: shellWindowRegistry })
      for (const [id, state] of Object.entries(defaults.windows || {})) {
        if (!layout.windows?.[id]) layout.windows[id] = state
        if (!layout.zOrder?.includes(id)) layout.zOrder.push(id)
      }
      return layout
    }

    function shellHost(id, el = document.getElementById('lsb-shell')) {
      if (id === 'nav') return el?.querySelector?.('#lsb-shell-rail') || null
      if (id === 'site') return el?.querySelector?.('#lsb-shell-aside') || null
      if (id === 'content') return el?.querySelector?.('#lsb-shell-window-content') || null
      const wanted = String(id || '')
      return [...(el?.querySelectorAll?.('[data-lsb-shell-window]') || [])]
        .find((node) => node.getAttribute('data-lsb-shell-window') === wanted) || null
    }

    function ensureWindowChrome(host, id, label) {
      if (!(host instanceof Element)) return null
      host.classList.add('lsb-shell-window')
      host.setAttribute('data-lsb-shell-window', id)
      host.setAttribute('role', 'region')
      if (!host.hasAttribute('tabindex')) host.tabIndex = 0
      const titleId = `lsb-shell-window-${id}-title`
      host.setAttribute('aria-labelledby', titleId)
      let bar = host.querySelector(':scope > [data-lsb-shell-window-bar]')
      if (!bar) {
        bar = document.createElement('div')
        bar.className = 'lsb-shell-window-bar'
        bar.setAttribute('data-lsb-shell-window-bar', '')
        const title = document.createElement('strong')
        title.className = 'lsb-shell-window-title'
        title.id = titleId
        title.textContent = label
        const drag = document.createElement('span')
        drag.className = 'lsb-shell-window-drag'
        drag.setAttribute('data-lsb-shell-window-drag', '')
        drag.setAttribute('aria-hidden', 'true')
        bar.append(title, drag)
        host.prepend(bar)
      } else {
        const title = bar.querySelector('.lsb-shell-window-title')
        if (title) title.textContent = label
      }
      const ensureAction = (kind, text, aria, titleText, handler) => {
        let button = bar.querySelector(`[data-lsb-shell-window-${kind}]`)
        if (!button) {
          button = document.createElement('button')
          button.type = 'button'
          button.className = 'lsb-shell-window-action'
          button.setAttribute(`data-lsb-shell-window-${kind}`, '')
          bar.append(button)
        }
        button.setAttribute('aria-label', aria)
        button.title = titleText
        button.textContent = text
        if (!button.dataset.lsbShellBound) {
          button.dataset.lsbShellBound = '1'
          button.addEventListener('click', (event) => {
            event.preventDefault()
            handler(button)
          })
        }
        return button
      }
      ensureAction('inspect', '⋮', `打开${label}窗口检查器`, '窗口检查器', () => {
        openWindowInspector(id)
      })
      ensureAction('focus', '◎', `聚焦${label}窗口`, '聚焦窗口', () => {
        focusShellWindow(id)
        host.focus?.()
      })
      ensureAction('collapse', '−', `折叠${label}窗口`, '折叠窗口', (button) => {
        toggleShellWindowCollapsed(id, button)
      })
      ensureAction('reset', '↺', `恢复${label}窗口布局`, '恢复布局', () => {
        resetShellWindow(id)
      })
      let body = host.querySelector(':scope > [data-lsb-shell-window-body]')
      if (!body) {
        body = document.createElement('div')
        body.className = 'lsb-shell-window-body'
        body.setAttribute('data-lsb-shell-window-body', '')
        while (bar.nextSibling) body.append(bar.nextSibling)
        host.append(body)
      }
      for (const edge of ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw']) {
        if (host.querySelector(`:scope > [data-lsb-shell-resize-edge="${edge}"]`)) continue
        const handle = document.createElement('span')
        handle.setAttribute('data-lsb-shell-resize-edge', edge)
        handle.setAttribute('aria-label', `调整${label}窗口${edge}边界`)
        handle.setAttribute('role', 'separator')
        host.append(handle)
      }
      return { host, bar, body }
    }

    function applyShellWindowState(id, state, host = shellHost(id)) {
      if (!(host instanceof Element) || !state) return
      host.style.left = `${Math.round(state.x || 0)}px`
      host.style.top = `${Math.round(state.y || 0)}px`
      host.style.width = `${Math.max(1, Math.round(state.width || 1))}px`
      host.style.height = `${Math.max(1, Math.round(state.height || 1))}px`
      host.style.zIndex = String(8000 + Math.max(0, shellWindowLayout?.zOrder?.indexOf(id) ?? 0))
      host.hidden = state.visible === false
      host.dataset.lsbShellActive = state.visible === false ? 'false' : 'true'
      host.dataset.lsbShellWindowId = id
      host.dataset.lsbShellCollapsed = state.collapsed === true ? 'true' : 'false'
      const localGlass = !!shellStyleApi?.sanitizeTokenValue?.('glassOpacity', state.overrides?.glassOpacity)
        || !!shellStyleApi?.sanitizeTokenValue?.('glassBlur', state.overrides?.glassBlur)
      host.dataset.lsbShellGlass = cfg.glass || localGlass ? 'true' : 'false'
      const oldOverrideProps = host.__lsbShellOverrideProps || new Set()
      for (const prop of oldOverrideProps) host.style.removeProperty(prop)
      const nextOverrideProps = new Set()
      if (shellStyleApi && state.overrides && typeof state.overrides === 'object') {
        const overrideCss = shellStyleApi.tokenCss(state.overrides)
        for (const declaration of overrideCss.split(';')) {
          const index = declaration.indexOf(':')
          if (index <= 0) continue
          const prop = declaration.slice(0, index).trim()
          const value = declaration.slice(index + 1).trim()
          if (!prop.startsWith('--lsb-shell-') || !value) continue
          host.style.setProperty(prop, value)
          nextOverrideProps.add(prop)
        }
      }
      host.__lsbShellOverrideProps = nextOverrideProps
      const body = host.querySelector(':scope > [data-lsb-shell-window-body]')
      if (body) body.hidden = state.collapsed === true
      const collapse = host.querySelector(':scope > [data-lsb-shell-window-bar] [data-lsb-shell-window-collapse]')
      if (collapse) {
        collapse.textContent = state.collapsed === true ? '+' : '−'
        collapse.setAttribute('aria-label', state.collapsed === true ? '展开窗口' : '折叠窗口')
        collapse.title = state.collapsed === true ? '展开窗口' : '折叠窗口'
      }
    }

    function collectShellWindowRegistry(el = document.getElementById('lsb-shell')) {
      const externalViews = syncExternalShellWindows(el)
      const external = typeof api.ui.shellWindows === 'function'
        ? api.ui.shellWindows(asideContext())
        : []
      const records = [...BUILTIN_WINDOWS]
      for (const item of externalViews) {
        if (records.some((row) => row.id === item.id)) continue
        records.push({
          id: item.id,
          label: item.label || item.id,
          order: Number(item.order) || 100,
          min: item.min || { width: 320, height: 240 },
          defaultRect: item.defaultRect || { width: 376, height: 600 },
          view: item.view,
        })
      }
      for (const view of external) {
        const id = String(view.windowId || view.id || '')
        if (!id || records.some((row) => row.id === id)) continue
        records.push({
          id,
          label: view.label || id,
          order: Number(view.order) || 100,
          min: view.min || { width: 240, height: 160 },
          defaultRect: view.defaultRect || { width: 320, height: 480 },
          view,
        })
      }
      shellWindowRegistry = records.filter((row) => shellHost(row.id, el))
      return shellWindowRegistry
    }

    function applyShellWindowLayout(layout = shellWindowLayout) {
      if (!layout) return
      for (const [id, state] of Object.entries(layout.windows || {})) applyShellWindowState(id, state)
      const workspace = shellWorkspace()
      if (workspace) workspace.dataset.lsbShellBucket = shellLayoutApi.widthBucket(shellViewport(workspace).width)
    }

    function syncExternalShellWindows(el = document.getElementById('lsb-shell')) {
      const workspace = shellWorkspace(el)
      if (!(workspace instanceof Element)) return []
      const context = asideContext()
      const asideRecords = api.ui.shellAsideViews(context)
        .filter((view) => view.windowId && view.windowId !== 'site')
        .map((view) => ({
          id: String(view.windowId),
          label: view.label || view.windowId,
          order: Number(view.order) || 100,
          min: view.min || { width: 320, height: 240 },
          defaultRect: view.defaultRect || { width: 376, height: 600 },
          view,
        }))
      const registered = typeof api.ui.shellWindows === 'function' ? api.ui.shellWindows(context) : []
      const records = [...asideRecords, ...registered.map((view) => ({
        id: String(view.windowId || view.id),
        label: view.label || view.id,
        order: Number(view.order) || 100,
        min: view.min || { width: 320, height: 240 },
        defaultRect: view.defaultRect || { width: 376, height: 600 },
        view,
      }))]
      const next = new Map()
      for (const record of records) {
        if (!record.id || next.has(record.id)) continue
        const host = shellHost(record.id, el) || (() => {
          const section = document.createElement('section')
          section.setAttribute('data-lsb-shell-window', record.id)
          workspace.append(section)
          return section
        })()
        ensureWindowChrome(host, record.id, record.label)
        const body = host.querySelector(':scope > [data-lsb-shell-window-body]')
        let current = externalWindowViews.get(record.id)
        if (!current || current.view !== record.view) {
          current?.dispose?.()
          body?.replaceChildren()
          let dispose = null
          try { dispose = record.view?.render?.(body, context) } catch (error) {
            if (body) body.textContent = '窗口加载失败'
            console.error('[LSB skin] 外部窗口渲染失败', record.id, error)
          }
          current = { ...record, host, body, dispose: typeof dispose === 'function' ? dispose : null }
        } else {
          current.host = host
          current.body = body
        }
        host.dataset.lsbShellExternal = 'true'
        host.dataset.lsbShellOpen = record.view?.windowId ? (record.view.id === asideActiveId ? 'true' : 'false') : 'true'
        next.set(record.id, current)
      }
      for (const [id, current] of externalWindowViews) {
        if (next.has(id)) continue
        try { current.dispose?.() } catch (error) { console.error('[LSB skin] 外部窗口清理失败', id, error) }
        current.host?.remove?.()
      }
      externalWindowViews.clear()
      for (const [id, current] of next) externalWindowViews.set(id, current)
      return [...next.values()]
    }

    function focusShellWindow(id, { persist = true } = {}) {
      const wanted = String(id || '')
      if (!shellWindowLayout?.windows?.[wanted]) return ''
      shellWindowLayout.zOrder = [...(shellWindowLayout.zOrder || []).filter((item) => item !== wanted), wanted]
      applyShellWindowLayout(shellWindowLayout)
      if (persist) saveShellLayout()
      return wanted
    }

    function toggleShellWindowCollapsed(id, button = null) {
      const wanted = String(id || '')
      const current = shellWindowLayout?.windows?.[wanted]
      if (!current) return null
      current.collapsed = !current.collapsed
      applyShellWindowLayout(shellWindowLayout)
      if (button) button.focus?.()
      saveShellLayout({ immediate: true })
      return current.collapsed
    }

    function arrangeShellWindows() {
      if (!shellWindowLayout || !shellLayoutApi) return null
      const workspace = shellWorkspace()
      shellWindowLayout = shellLayoutApi.arrangeShellWindows(shellWindowLayout, shellWindowRegistry, shellViewport(workspace))
      applyShellWindowLayout(shellWindowLayout)
      saveShellLayout({ immediate: true })
      return structuredCloneSafe(shellWindowLayout)
    }

    function resetShellWindow(id) {
      if (!shellWindowLayout || !shellLayoutApi) return null
      const wanted = String(id || '')
      const workspace = shellWorkspace()
      const defaults = shellLayoutApi.defaultShellLayout({ ...shellViewport(workspace), registry: shellWindowRegistry })
      if (wanted && shellWindowLayout.windows[wanted] && defaults.windows[wanted]) {
        shellWindowLayout.windows[wanted] = defaults.windows[wanted]
      } else if (!wanted) {
        shellWindowLayout = defaults
      }
      applyShellWindowLayout(shellWindowLayout)
      saveShellLayout({ immediate: true })
      return structuredCloneSafe(shellWindowLayout)
    }

    function openWindowInspector(id) {
      const wanted = String(id || '')
      const current = shellWindowLayout?.windows?.[wanted]
      const host = shellHost(wanted)
      if (!current || !(host instanceof Element)) return null
      document.querySelector('[data-lsb-shell-window-inspector]')?.remove()
      const mask = document.createElement('div')
      mask.setAttribute('data-lsb-shell-window-inspector', '')
      mask.setAttribute('role', 'dialog')
      mask.setAttribute('aria-modal', 'true')
      mask.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgb(0 0 0 / 28%);padding:16px;'
      const panel = document.createElement('div')
      panel.style.cssText = 'width:min(360px,92vw);max-height:90vh;overflow:auto;background:var(--panel,#fff);color:var(--text,#222);border:1px solid var(--line,#ddd);border-radius:12px;padding:16px;box-shadow:0 18px 48px rgb(0 0 0 / 24%);'
      const title = document.createElement('h2')
      title.textContent = `${host.querySelector('.lsb-shell-window-title')?.textContent || wanted}窗口检查器`
      title.style.cssText = 'font-size:16px;margin:0 0 12px;'
      panel.append(title)
      const fields = new Map()
      const styleModel = shellStyleApi?.moduleInspectorModel?.(shellWindowLayout, wanted) || { values: {}, inherited: {} }
      const overrideNames = ['fontFamily', 'baseFontSize', 'glassOpacity', 'glassBlur']
      const addField = (name, labelText, type = 'text', value = '', step = '') => {
        const label = document.createElement('label')
        label.style.cssText = 'display:flex;align-items:center;gap:8px;margin:8px 0;font-size:13px;'
        const text = document.createElement('span')
        text.textContent = labelText
        const input = document.createElement('input')
        input.type = type
        input.setAttribute('data-lsb-shell-inspector-field', name)
        if (type === 'number' && step) input.step = step
        input.value = value ?? ''
        input.style.cssText = 'flex:1;min-width:0;'
        label.append(text, input)
        panel.append(label)
        fields.set(name, input)
      }
      const visible = document.createElement('label')
      visible.style.cssText = 'display:flex;gap:8px;align-items:center;margin:8px 0;font-size:13px;'
      const visibleInput = document.createElement('input')
      visibleInput.type = 'checkbox'
      visibleInput.checked = current.visible !== false
      const visibleText = document.createElement('span')
      visibleText.textContent = '显示窗口'
      visible.append(visibleInput, visibleText)
      panel.append(visible)
      const collapsed = document.createElement('label')
      collapsed.style.cssText = visible.style.cssText
      const collapsedInput = document.createElement('input')
      collapsedInput.type = 'checkbox'
      collapsedInput.checked = current.collapsed === true
      const collapsedText = document.createElement('span')
      collapsedText.textContent = '折叠窗口'
      collapsed.append(collapsedInput, collapsedText)
      panel.append(collapsed)
      addField('width', '宽度', 'number', current.width)
      addField('height', '高度', 'number', current.height)
      const inspectorField = (name, labelText, type = 'text', step = '') => {
        const raw = current.overrides?.[name] ?? styleModel.values?.[name] ?? ''
        const value = type === 'number' ? String(raw).replace(/px$/i, '') : raw
        addField(name, labelText, type, value, step)
      }
      inspectorField('fontFamily', '局部字体')
      inspectorField('baseFontSize', '局部字号', 'number', '1')
      inspectorField('glassOpacity', '局部透明度', 'number', '0.01')
      inspectorField('glassBlur', '局部玻璃模糊', 'number', '1')
      const inherit = document.createElement('label')
      inherit.style.cssText = visible.style.cssText
      const inheritInput = document.createElement('input')
      inheritInput.type = 'checkbox'
      inheritInput.checked = overrideNames.every((name) => styleModel.inherited?.[name] !== false)
      const inheritText = document.createElement('span')
      inheritText.textContent = '局部样式继承全局'
      inherit.append(inheritInput, inheritText)
      panel.append(inherit)
      for (const name of overrideNames) {
        fields.get(name)?.addEventListener('input', () => {
          if (String(fields.get(name).value || '').trim()) inheritInput.checked = false
        })
      }
      const actions = document.createElement('div')
      actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:14px;'
      const cancel = document.createElement('button')
      cancel.type = 'button'
      cancel.textContent = '取消'
      const save = document.createElement('button')
      save.type = 'button'
      save.textContent = '保存'
      save.className = 'lsb-btn is-primary'
      actions.append(cancel, save)
      panel.append(actions)
      mask.append(panel)
      document.body.append(mask)
      const close = () => mask.remove()
      cancel.addEventListener('click', close)
      mask.addEventListener('click', (event) => { if (event.target === mask) close() })
      save.addEventListener('click', () => {
        const next = { ...current }
        next.visible = visibleInput.checked
        next.collapsed = collapsedInput.checked
        next.width = Number(fields.get('width').value)
        next.height = Number(fields.get('height').value)
        const overrides = { ...(current.overrides || {}) }
        for (const name of overrideNames) {
          if (inheritInput.checked || !String(fields.get(name).value || '').trim()) delete overrides[name]
          else overrides[name] = fields.get(name).value
        }
        next.overrides = overrides
        shellWindowLayout.windows[wanted] = next
        shellWindowLayout = shellLayoutApi.sanitizeShellLayout(shellWindowLayout, {
          ...shellViewport(shellWorkspace()),
          registry: shellWindowRegistry,
        })
        applyShellWindowLayout(shellWindowLayout)
        saveShellLayout({ immediate: true })
        syncResponsiveMode()
        close()
      })
      panel.querySelector('input')?.focus?.()
      return mask
    }

    function windowBounds() {
      return shellLayoutApi
        ? { x: 0, y: 0, ...shellViewport(shellWorkspace()) }
        : { x: 0, y: 0, width: Number(window.innerWidth || 1), height: Number(window.innerHeight || 1) }
    }

    function windowMin(id) {
      return shellWindowRegistry.find((item) => item.id === id)?.min || { width: 240, height: 160 }
    }

    function windowOthers(id) {
      return Object.entries(shellWindowLayout?.windows || {})
        .filter(([otherId, state]) => otherId !== id && state?.visible !== false)
        .map(([, state]) => state)
    }

    function interactionEventPosition(event) {
      return { x: Number(event.clientX || 0), y: Number(event.clientY || 0) }
    }

    function interactionNextRect(state, { snap = false } = {}) {
      const dx = state.last.x - state.start.x
      const dy = state.last.y - state.start.y
      const next = { ...state.origin }
      if (state.kind === 'drag') {
        next.x += dx
        next.y += dy
      } else {
        const edge = state.edge
        if (edge.includes('w')) {
          next.x += dx
          next.width -= dx
        }
        if (edge.includes('e')) next.width += dx
        if (edge.includes('n')) {
          next.y += dy
          next.height -= dy
        }
        if (edge.includes('s')) next.height += dy
      }
      return shellLayoutApi.snapRect(next, {
        bounds: windowBounds(),
        others: windowOthers(state.id),
        min: windowMin(state.id),
        grid: snap ? undefined : 1,
        threshold: snap ? undefined : 0,
      })
    }

    function flushWindowInteraction() {
      const state = windowInteractionState
      windowInteractionRaf = 0
      if (!state || !shellWindowLayout?.windows?.[state.id]) return
      const next = interactionNextRect(state)
      state.pending = next
      if (state.kind === 'drag') {
        state.host.style.transform = `translate3d(${next.x - state.origin.x}px,${next.y - state.origin.y}px,0)`
      } else {
        state.host.style.left = `${next.x}px`
        state.host.style.top = `${next.y}px`
        state.host.style.width = `${next.width}px`
        state.host.style.height = `${next.height}px`
      }
    }

    function scheduleWindowInteraction() {
      if (windowInteractionRaf) return
      const raf = window.requestAnimationFrame || ((fn) => window.setTimeout(fn, 0))
      windowInteractionRaf = raf(flushWindowInteraction)
    }

    function endWindowInteraction(event) {
      const state = windowInteractionState
      if (!state) return
      if (event?.type === 'pointerup' && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
        state.last = interactionEventPosition(event)
      }
      if (windowInteractionRaf) {
        const cancel = window.cancelAnimationFrame || window.clearTimeout
        cancel(windowInteractionRaf)
        windowInteractionRaf = 0
      }
      flushWindowInteraction()
      const finalRect = state.pending ? interactionNextRect(state, { snap: true }) : state.origin
      const current = shellWindowLayout?.windows?.[state.id]
      if (current) shellWindowLayout.windows[state.id] = { ...current, ...finalRect }
      state.host.style.transform = ''
      delete state.host.dataset.lsbShellInteracting
      applyShellWindowLayout(shellWindowLayout)
      saveShellLayout({ immediate: true })
      window.removeEventListener('pointermove', onWindowPointerMove)
      window.removeEventListener('pointerup', endWindowInteraction)
      window.removeEventListener('pointercancel', endWindowInteraction)
      try { state.captureTarget?.releasePointerCapture?.(state.pointerId) } catch { /* jsdom/旧浏览器没有 pointer capture */ }
      windowInteractionState = null
    }

    function onWindowPointerMove(event) {
      if (!windowInteractionState) return
      windowInteractionState.last = interactionEventPosition(event)
      scheduleWindowInteraction()
    }

    function beginWindowInteraction(event, host, id, kind, edge = '') {
      if (event.button != null && event.button !== 0) return
      const current = shellWindowLayout?.windows?.[id]
      if (!current) return
      event.preventDefault()
      focusShellWindow(id, { persist: false })
      const point = interactionEventPosition(event)
      windowInteractionState = {
        id,
        host,
        kind,
        edge,
        start: point,
        last: point,
        origin: { x: current.x, y: current.y, width: current.width, height: current.height },
        pending: null,
        pointerId: event.pointerId,
        captureTarget: event.currentTarget,
      }
      host.dataset.lsbShellInteracting = kind
      try { event.currentTarget?.setPointerCapture?.(event.pointerId) } catch { /* jsdom/旧浏览器没有 pointer capture */ }
      window.addEventListener('pointermove', onWindowPointerMove)
      window.addEventListener('pointerup', endWindowInteraction, { once: false })
      window.addEventListener('pointercancel', endWindowInteraction, { once: false })
    }

    function keyWindowHost(event) {
      const target = event?.target
      if (target?.closest) {
        const fromTarget = target.closest('[data-lsb-shell-window]')
        if (fromTarget) return fromTarget
      }
      const active = document.activeElement
      return active?.closest?.('[data-lsb-shell-window]') || null
    }

    function onWindowKeyDown(event) {
      const host = keyWindowHost(event)
      if (!(host instanceof Element)) return
      const id = host.getAttribute('data-lsb-shell-window') || ''
      if (!shellWindowLayout?.windows?.[id]) return
      if (event.key === 'Escape') {
        if (windowInteractionState) {
          event.preventDefault()
          endWindowInteraction()
        }
        return
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      const target = event.target
      if (target?.matches?.('input, textarea, select, button, a, [contenteditable="true"]')) return
      const current = shellWindowLayout.windows[id]
      const step = 12
      const next = { ...current }
      if (event.shiftKey) {
        if (event.key === 'ArrowLeft') { next.x += step; next.width -= step }
        if (event.key === 'ArrowRight') next.width += step
        if (event.key === 'ArrowUp') { next.y += step; next.height -= step }
        if (event.key === 'ArrowDown') next.height += step
      } else {
        if (event.key === 'ArrowLeft') next.x -= step
        if (event.key === 'ArrowRight') next.x += step
        if (event.key === 'ArrowUp') next.y -= step
        if (event.key === 'ArrowDown') next.y += step
      }
      const clean = shellLayoutApi.snapRect(next, {
        bounds: windowBounds(),
        others: windowOthers(id),
        min: windowMin(id),
      })
      event.preventDefault()
      focusShellWindow(id)
      shellWindowLayout.windows[id] = { ...current, ...clean }
      applyShellWindowLayout(shellWindowLayout)
      saveShellLayout()
    }

    function syncResponsiveMode(el = document.getElementById('lsb-shell')) {
      if (!(el instanceof Element) || !shellWindowEnabled()) return
      const workspace = shellWorkspace(el)
      const viewport = shellViewport(workspace)
      const width = viewport.width
      const bucket = shellLayoutApi.widthBucket(width)
      const key = shellLayoutStorageKey(viewport)
      if (shellWindowLayout && shellLayoutKey && key !== shellLayoutKey) {
        saveShellLayout({ immediate: true })
        shellWindowLayout = loadShellLayout(viewport)
        shellWindowLayout = ensureRegisteredShellLayout(shellWindowLayout, viewport)
        applyShellWindowLayout(shellWindowLayout)
      } else if (shellWindowLayout) {
        shellWindowLayout = shellLayoutApi.sanitizeShellLayout(shellWindowLayout, {
          ...viewport,
          registry: shellWindowRegistry,
        })
        applyShellWindowLayout(shellWindowLayout)
      }
      el.dataset.lsbShellBucket = bucket
      const switcher = el.querySelector('[data-lsb-shell-window-switcher]')
      if (switcher) {
        switcher.replaceChildren()
        for (const item of shellWindowRegistry) {
          const button = document.createElement('button')
          button.type = 'button'
          button.setAttribute('role', 'tab')
          button.setAttribute('data-lsb-shell-window-switch', item.id)
          button.setAttribute('aria-controls', shellHost(item.id, el)?.id || `lsb-shell-window-${item.id}`)
          button.textContent = item.label
          button.addEventListener('click', () => {
            narrowActiveWindow = item.id
            const external = externalWindowViews.get(item.id)
            if (external?.view?.id) asideSetActive(external.view.id, el.querySelector('#lsb-shell-aside'), true)
            focusShellWindow(item.id)
            syncResponsiveMode(el)
          })
          switcher.append(button)
        }
      }
      const available = shellWindowRegistry.filter((item) => shellWindowLayout?.windows?.[item.id]?.visible !== false)
      if (!available.some((item) => item.id === narrowActiveWindow)) narrowActiveWindow = available[0]?.id || 'content'
      for (const item of shellWindowRegistry) {
        const host = shellHost(item.id, el)
        if (!(host instanceof Element)) continue
        const active = bucket !== 'narrow' || item.id === narrowActiveWindow
        host.dataset.lsbShellActive = active ? 'true' : 'false'
        const tab = switcher?.querySelector(`[data-lsb-shell-window-switch="${item.id}"]`)
        if (tab) tab.setAttribute('aria-selected', active ? 'true' : 'false')
      }
    }

    function bindWindowInteractions(el = document.getElementById('lsb-shell')) {
      if (!(el instanceof Element) || !shellWindowEnabled()) return
      for (const item of shellWindowRegistry) {
        const host = shellHost(item.id, el)
        if (!(host instanceof Element)) continue
        if (host.dataset.lsbShellWindowInteractionsBound !== '1') {
          host.dataset.lsbShellWindowInteractionsBound = '1'
          const bar = host.querySelector(':scope > [data-lsb-shell-window-bar]')
          bar?.addEventListener('pointerdown', (event) => {
            if (event.target.closest?.('[data-lsb-shell-window-action], [data-lsb-shell-resize-edge], input, textarea, select, button, a')) return
            beginWindowInteraction(event, host, item.id, 'drag')
          })
          host.addEventListener('pointerdown', (event) => {
            if (event.target.closest?.('[data-lsb-shell-window-action], [data-lsb-shell-window-bar], [data-lsb-shell-resize-edge], input, textarea, button, a')) return
            focusShellWindow(item.id)
            if (event.currentTarget === host && event.target === host) host.focus?.()
          })
          host.addEventListener('focus', () => focusShellWindow(item.id))
          for (const handle of host.querySelectorAll('[data-lsb-shell-resize-edge]')) {
            handle.addEventListener('pointerdown', (event) => beginWindowInteraction(event, host, item.id, 'resize', handle.getAttribute('data-lsb-shell-resize-edge') || 'se'))
          }
        }
      }
      if (!windowInteractionBound) {
        windowInteractionBound = true
        window.addEventListener('keydown', onWindowKeyDown)
        if (!responsiveBound) {
          responsiveBound = true
          responsiveHandler = () => syncResponsiveMode(el)
          window.addEventListener('resize', responsiveHandler)
        }
      }
    }

    function unbindWindowInteractions() {
      endWindowInteraction()
      windowInteractionBound = false
      window.removeEventListener('keydown', onWindowKeyDown)
      if (responsiveBound) {
        responsiveBound = false
        if (responsiveHandler) window.removeEventListener('resize', responsiveHandler)
        responsiveHandler = null
      }
    }

    function isNativeSidebarNode(node) {
      return node instanceof Element
        && node.matches('aside.sidebar')
        && node.id !== 'mobile-menu-drawer'
        && !node.classList.contains('mobile-menu-drawer')
    }

    function detachNativeSidebars(outlet) {
      if (!(outlet instanceof Element)) return
      for (const side of [...outlet.querySelectorAll('aside.sidebar')].filter(isNativeSidebarNode)) {
        if (!nativeSidebarHomes.has(side)) {
          nativeSidebarHomes.set(side, { parent: side.parentNode, next: side.nextSibling })
        }
        if (side.parentNode !== document.body) document.body.append(side)
      }
      for (const rail of nativeLeftRails(outlet)) {
        if (!nativeSidebarHomes.has(rail)) {
          nativeSidebarHomes.set(rail, { parent: rail.parentNode, next: rail.nextSibling })
        }
        rail.classList.add('lsb-native-left-hidden')
        if (rail.parentNode !== document.body) document.body.append(rail)
      }
    }

    function restoreDetachedNativeSidebars() {
      for (const [side, home] of nativeSidebarHomes) {
        const parent = home?.parent
        if (parent instanceof Node && parent.isConnected && side.parentNode !== parent) {
          try {
            parent.insertBefore(side, home.next && home.next.parentNode === parent ? home.next : null)
          } catch {
            try { parent.append(side) } catch { /* stale route node */ }
          }
        }
      }
      nativeSidebarHomes.clear()
    }

    function syncShellScrollBridge(root = null) {
      const next = root instanceof Element ? root : null
      if (scrollBridge?.root === next) return
      scrollBridge?.dispose?.()
      scrollBridge = null
      if (!next || typeof api.ui.shellScrollBridge !== 'function') return
      try {
        scrollBridge = api.ui.shellScrollBridge({ windowRef: window, root: next })
      } catch {
        scrollBridge = null
      }
    }

    function mountContentWindow(el = document.getElementById('lsb-shell')) {
      const content = shellHost('content', el)
      const body = content?.querySelector?.('[data-lsb-shell-window-body]')
      if (!(content instanceof Element) || !(body instanceof Element)) return
      const outlet = findRouteOutlet()
      if (!(outlet instanceof Element)) return
      if (contentOutlet && contentOutlet !== outlet) restoreDetachedNativeSidebars()
      if (!contentHome) contentHome = { parent: outlet.parentNode, next: outlet.nextSibling }
      contentOutlet = outlet
      detachNativeSidebars(outlet)
      if (outlet.parentNode !== body) body.append(outlet)
      contentScroller = body
      syncShellScrollBridge(body)
    }

    function mountShellWindows(el = document.getElementById('lsb-shell')) {
      if (!(el instanceof Element) || !shellWindowEnabled()) return
      const workspace = shellWorkspace(el)
      if (!(workspace instanceof Element)) return
      const nav = shellHost('nav', el)
      const site = shellHost('site', el)
      const content = shellHost('content', el)
      ensureWindowChrome(nav, 'nav', '导航')
      ensureWindowChrome(site, 'site', '站点')
      ensureWindowChrome(content, 'content', '正文')
      mountContentWindow(el)
      collectShellWindowRegistry(el)
      const viewport = shellViewport(workspace)
      const key = shellLayoutStorageKey(viewport)
      if (shellWindowLayout && shellLayoutKey === key) {
        shellWindowLayout = shellLayoutApi.sanitizeShellLayout(shellWindowLayout, { ...viewport, registry: shellWindowRegistry })
      } else {
        if (shellWindowLayout && shellLayoutKey && shellLayoutKey !== key) saveShellLayout({ immediate: true })
        shellWindowLayout = loadShellLayout(viewport)
      }
      shellWindowLayout = ensureRegisteredShellLayout(shellWindowLayout, viewport)
      applyShellWindowLayout(shellWindowLayout)
      el.dataset.lsbShellMode = 'windowed'
      if (content) content.dataset.lsbShellActive = 'true'
      syncResponsiveMode(el)
      bindWindowInteractions(el)
    }

    function unmountShellWindows() {
      saveShellLayout({ immediate: true })
      window.clearTimeout(shellLayoutSaveTimer)
      shellLayoutSaveTimer = 0
      restoreDetachedNativeSidebars()
      const outlet = contentOutlet
      if (outlet && contentHome?.parent) {
        try {
          contentHome.parent.insertBefore(outlet, contentHome.next && contentHome.next.parentNode === contentHome.parent ? contentHome.next : null)
        } catch {
          document.body.append(outlet)
        }
      }
      contentHome = null
      contentOutlet = null
      contentScroller = null
      syncShellScrollBridge()
      shellWindowLayout = null
      shellWindowRegistry = []
      shellLayoutKey = ''
    }

    /* ── M17 单一阅读画布 ─────────────────────────────────────────────── */
    function canvasPageType() {
      const type = String(api.page?.type || '')
      if (['home', 'forum', 'topic', 'user', 'settings'].includes(type)) return type
      const path = pagePath()
      if (path === '/' || path === '/index.php') return 'home'
      if (/^\/forum\/\d+/.test(path) || /^\/category\/\d+/.test(path)) return 'forum'
      if (/^\/topic\/\d+/.test(path)) return 'topic'
      if (/^\/user(?:\/|$)/.test(path)) return 'user'
      if (/settings|preferences|config/i.test(path)) return 'settings'
      return 'page'
    }

    function canvasApplyPageClass() {
      const root = document.documentElement
      for (const name of ['home', 'forum', 'topic', 'user', 'settings', 'page']) root.classList.remove(`lsb-canvas-page-${name}`)
      const pageType = canvasPageType()
      root.classList.add(`lsb-canvas-page-${pageType}`)
      const outlet = findRouteOutlet()
      outlet?.classList.toggle('lsb-canvas-content-root', true)
      canvasSiteKey = siteKeyFromLocation(location)
      canvasWidthClass = widthClass(canvasViewport().width)
      if (canvasState) canvasEffective = mergeCanvasState(canvasState, canvasState.sites?.[canvasSiteKey] || {})
      if (canvasScrollBound) canvasSyncScrollTarget()
    }

    function canvasSurface(id) {
      const wanted = String(id || '')
      if (!wanted) return null
      return canvasSurfaceHost?.querySelector?.(`[data-surface="${wanted.replace(/"/g, '')}"]`) || null
    }

    function canvasSetBackdrop(visible) {
      const backdrop = canvasSurfaceHost?.querySelector?.('[data-canvas-backdrop]')
      if (!(backdrop instanceof HTMLElement)) return
      backdrop.hidden = !visible
      backdrop.setAttribute('aria-hidden', String(!visible))
    }

    function canvasFocusFirst(surface) {
      if (!(surface instanceof Element)) return
      const target = surface.querySelector('button:not([disabled]),a[href],input,textarea,select,[tabindex]:not([tabindex="-1"])')
      target?.focus?.()
    }

    function canvasCloseSurface(id = canvasActiveSheet, restore = true) {
      if (id === 'site-card' && canvasWidthClass === 'wide') {
        const host = canvasSurface('site-status')?.querySelector('[data-canvas-site-status-host]')
        canvasSiteStatusSetExpanded(host, false, false)
        if (canvasActiveSheet === id) canvasActiveSheet = ''
        if (!canvasActiveSheet) canvasSetBackdrop(false)
        const trigger = canvasFocusReturn
        canvasFocusReturn = null
        if (restore && trigger?.isConnected) trigger.focus?.()
        return
      }
      const surface = canvasSurface(id)
      if (surface) {
        surface.setAttribute('data-canvas-surface-state', 'closing')
        surface.hidden = true
        surface.setAttribute('aria-hidden', 'true')
        surface.setAttribute('data-canvas-surface-state', 'closed')
      }
      if (canvasActiveSheet === id) canvasActiveSheet = ''
      if (!canvasActiveSheet) canvasSetBackdrop(false)
      if (id === 'site-card') canvasRestoreSiteSidebar({ restorePersistent: true })
      const trigger = canvasFocusReturn
      canvasFocusReturn = null
      if (restore && trigger?.isConnected) trigger.focus?.()
    }

    function closePluginMenuSurfaces() {
      for (const id of ['plugin-features-sheet', 'plugin-settings-sheet', 'tool-sheet']) {
        canvasCloseSurface(id, false)
      }
    }

    function openPluginFeature(pluginId) {
      const entry = collectPluginFeatureEntries().find((item) => item.plugin === pluginId)
      closePluginMenuSurfaces()
      if (!entry) {
        api.ui.toast('这个插件功能当前不可用', { type: 'info' })
        return
      }
      if (entry.panel) {
        api.ui.openPanel(entry.panel)
        return
      }
      try {
        Promise.resolve(api.request(entry.rpc)).catch(() => {
          api.ui.toast('插件功能打开失败', { type: 'error' })
        })
      } catch {
        api.ui.toast('插件功能打开失败', { type: 'error' })
      }
    }

    function openPluginSettings(pluginId) {
      const available = collectPluginSettingsEntries().some((item) => item.id === pluginId)
      closePluginMenuSurfaces()
      if (!available) {
        api.ui.toast('这个插件没有可用的设置表单', { type: 'info' })
        return
      }
      try {
        api.ui.openPluginSettings(pluginId)
      } catch {
        api.ui.toast('插件设置当前不可用', { type: 'error' })
      }
    }

    function canvasCloseContextPill(restore = false) {
      const pill = canvasSurface('context-pill')
      if (pill) {
        pill.setAttribute('data-canvas-surface-state', 'closing')
        pill.hidden = true
        pill.setAttribute('aria-hidden', 'true')
        pill.setAttribute('data-canvas-surface-state', 'closed')
      }
      canvasSelectionPost = null
      canvasSelectionText = ''
      if (canvasSelectionDismissTimer) {
        window.clearTimeout(canvasSelectionDismissTimer)
        canvasSelectionDismissTimer = 0
      }
      if (restore && canvasFocusReturn?.isConnected) canvasFocusReturn.focus?.()
    }

    function canvasNativeAction(action) {
      const post = canvasSelectionPost
      const text = canvasSelectionText
      if (!(post instanceof Element)) return
      const clickFirst = (selectors) => {
        for (const selector of selectors) {
          const target = post.querySelector(selector) || document.querySelector(selector)
          if (target instanceof HTMLElement || target instanceof SVGElement) {
            target.click?.()
            target.focus?.()
            return true
          }
        }
        return false
      }
      if (action === 'reply') {
        clickFirst(['.reply-box', '.post-reply', '[data-reply-action]'])
          || clickFirst(['.reply-panel textarea[name="body"]', '.reply-panel textarea', 'textarea[name="body"]', '.btn-post[href="#reply"]'])
      } else if (action === 'quote') {
        clickFirst(['.quote-reply', '[data-quote-action]', 'a[href="#reply"]'])
      } else if (action === 'favorite') {
        clickFirst(['.favorite-action', '[data-favorite-action]', '.topic-favorites-action .fav-btn', '.topic-favorites-action button'])
      } else if (action === 'copy' && text) {
        try {
          const clipboard = navigator.clipboard
          if (clipboard?.writeText) void clipboard.writeText(text)
          else {
            const area = document.createElement('textarea')
            area.value = text
            area.setAttribute('aria-hidden', 'true')
            area.style.cssText = 'position:fixed;left:-9999px;top:0'
            document.body.append(area)
            area.select()
            document.execCommand?.('copy')
            area.remove()
          }
          api.ui.toast?.('已复制选中文本', { type: 'success' })
        } catch {
          api.ui.toast?.('复制失败，请手动选择文本', { type: 'error' })
        }
      }
    }

    function canvasShowContextPill(post, range) {
      const pill = canvasSurface('context-pill')
      if (!(pill instanceof Element) || !(post instanceof Element)) return
      const text = String(window.getSelection?.()?.toString?.() || '').trim()
      if (!text) return canvasCloseContextPill()
      const rect = range?.getBoundingClientRect?.() || post.getBoundingClientRect?.()
      canvasSelectionPost = post
      canvasSelectionText = text.slice(0, 2000)
      pill.hidden = false
      pill.setAttribute('aria-hidden', 'false')
      canvasZIndex += 1
      pill.style.zIndex = String(8020 + canvasZIndex)
      const viewport = canvasViewport()
      const width = Math.min(260, Math.max(180, pill.getBoundingClientRect?.().width || 220))
      const height = Math.max(36, pill.getBoundingClientRect?.().height || 42)
      const x = Math.min(Math.max(8, Number(rect?.left || 0)), Math.max(8, viewport.width - width - 8))
      const y = Math.min(Math.max(8, Number(rect?.bottom || 0) + 8), Math.max(8, viewport.height - height - 8))
      pill.style.left = `${Math.round(x)}px`
      pill.style.top = `${Math.round(y)}px`
      pill.style.right = 'auto'
      pill.style.bottom = 'auto'
      if (canvasSelectionDismissTimer) window.clearTimeout(canvasSelectionDismissTimer)
      canvasSelectionDismissTimer = window.setTimeout(() => {
        canvasSelectionDismissTimer = 0
        if (!pill.matches(':focus-within')) canvasCloseContextPill()
      }, 8000)
    }

    function canvasSelectionSync() {
      if (!canvasSurfaceHost || canvasActiveSheet === 'context-pill') return
      const selection = window.getSelection?.()
      const text = String(selection?.toString?.() || '').trim()
      const node = selection?.anchorNode
      const post = node?.nodeType === 1 ? node.closest?.('.post-entry, .post-item') : node?.parentElement?.closest?.('.post-entry, .post-item')
      if (!text || !(post instanceof Element) || !document.documentElement.contains(post)) {
        if (!canvasSurface('context-pill')?.matches(':focus-within')) canvasCloseContextPill()
        return
      }
      canvasShowContextPill(post, selection.getRangeAt?.(0))
    }

    function canvasBindSelection() {
      if (canvasSelectionBound) return
      canvasSelectionBound = true
      canvasSelectionHandler = () => {
        const raf = window.requestAnimationFrame || ((fn) => window.setTimeout(fn, 0))
        raf(canvasSelectionSync)
      }
      document.addEventListener('selectionchange', canvasSelectionHandler, { passive: true })
      document.addEventListener('pointerup', canvasSelectionHandler, { passive: true })
    }

    function canvasUnbindSelection() {
      if (!canvasSelectionBound) return
      canvasSelectionBound = false
      if (canvasSelectionHandler) {
        document.removeEventListener('selectionchange', canvasSelectionHandler)
        document.removeEventListener('pointerup', canvasSelectionHandler)
      }
      canvasSelectionHandler = null
      canvasCloseContextPill()
    }

    function canvasOpenSurface(id, trigger = null) {
      const wanted = String(id || '')
      if (wanted === 'site-card' && canvasWidthClass === 'wide') return canvasOpenSiteStatus(trigger)
      const surface = canvasSurface(wanted)
      if (!(surface instanceof Element)) return null
      if (wanted === 'plugin-features-sheet') renderPluginFeatureEntries()
      if (wanted === 'plugin-settings-sheet') renderPluginSettingsEntries()
      if (wanted !== 'context-pill') canvasCloseContextPill()
      if (canvasActiveSheet && canvasActiveSheet !== wanted) canvasCloseSurface(canvasActiveSheet, false)
      canvasFocusReturn = trigger instanceof Element ? trigger : (document.activeElement instanceof Element ? document.activeElement : null)
      surface.hidden = false
      surface.setAttribute('aria-hidden', 'false')
      surface.setAttribute('data-canvas-surface-state', 'opening')
      canvasActiveSheet = wanted
      const isPersistentRail = wanted === 'site-card' && surface.dataset.surfaceMode === 'rail'
      if (wanted !== 'context-pill') canvasSetBackdrop(!isPersistentRail)
      if (wanted === 'site-card') canvasSyncSiteSidebar(surface)
      canvasZIndex += 1
      surface.style.zIndex = String(8010 + canvasZIndex)
      canvasFocusFirst(surface)
      const raf = window.requestAnimationFrame || ((fn) => window.setTimeout(fn, 0))
      raf(() => {
        if (surface.hidden || surface.getAttribute('aria-hidden') !== 'false') return
        surface.setAttribute('data-canvas-surface-state', 'open')
      })
      return surface
    }


    function canvasRenderNavigation(surface) {
      if (!(surface instanceof Element)) return
      const list = surface.querySelector('[data-canvas-navigation-list]')
      if (!(list instanceof Element)) return
      list.replaceChildren()
      const currentHref = `${location.pathname}${location.search}${location.hash}`
      const favorite = document.querySelector('a[href*="tab=favorites"], a[href*="favorites"]')
      const search = document.querySelector('form.search-form')
      const entries = [
        { href: '/', label: '全部主题', group: '站点' },
        { href: api.routes.homeSorted('post'), label: '新帖子', group: '站点' },
        ...(currentHref !== '/' ? [{ href: currentHref, label: '当前页面', group: '最近访问' }] : []),
        ...(favorite?.getAttribute('href') ? [{ href: favorite.getAttribute('href'), label: '我的收藏', group: '收藏' }] : []),
        ...(search?.getAttribute('action') ? [{ href: search.getAttribute('action'), label: '站内搜索', group: '搜索' }] : [{ href: '/search', label: '站内搜索', group: '搜索' }]),
        ...collectBoards().slice(0, 80).map((item) => ({ href: item.href, label: item.label, group: '版块' })),
      ]
      const seen = new Set()
      for (const item of entries) {
        if (!item?.href || !item.label || seen.has(item.href)) continue
        seen.add(item.href)
        const link = document.createElement('a')
        link.href = item.href
        link.textContent = item.label
        link.title = item.group || ''
        link.setAttribute('data-canvas-navigation-link', '')
        link.style.cssText = 'display:block;padding:10px 12px;border-radius:10px;color:inherit;text-decoration:none'
        link.addEventListener('click', () => canvasCloseSurface('navigation-sheet', false))
        list.append(link)
      }
    }

    function canvasSyncText() {
      const title = canvasSurface('top-status')?.querySelector('[data-canvas-status-title]')
      const morphText = (node, value) => {
        if (!(node instanceof HTMLElement)) return
        const next = String(value ?? '')
        if (node.textContent === next) return
        node.setAttribute('data-route-transition', 'in')
        node.textContent = next
        const clear = () => {
          if (node.isConnected && node.textContent === next) node.removeAttribute('data-route-transition')
        }
        if (typeof queueMicrotask === 'function') queueMicrotask(clear)
        else Promise.resolve().then(clear)
      }
      morphText(title, canvasPageType() === 'topic' ? 'LINUX SB' : locationText())
      canvasRenderNavigation(canvasSurface('navigation-sheet'))
      renderCanvasTopLinks()
      const currentPage = canvasPageType()
      canvasSurfaceHost?.setAttribute('data-canvas-page', currentPage)
    }

    function canvasSurfaceRect(surface) {
      if (!(surface instanceof Element)) return { x: 0, y: 0, width: 320, height: 240 }
      const rect = surface.getBoundingClientRect?.()
      const parse = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback
      return {
        x: parse(rect?.left, parseFloat(surface.style.left) || 0),
        y: parse(rect?.top, parseFloat(surface.style.top) || 0),
        width: parse(rect?.width, parseFloat(surface.style.width) || 420),
        height: parse(rect?.height, parseFloat(surface.style.height) || 560),
      }
    }

    function canvasPersistSurfaceRect(id, rect) {
      if (!canvasState || !canvasSiteKey || !CANVAS_WIDTH_CLASSES.includes(canvasWidthClass)) return
      const site = canvasState.sites[canvasSiteKey] || {}
      const layout = site.layout && typeof site.layout === 'object' ? site.layout : {}
      const bucket = layout[canvasWidthClass] && typeof layout[canvasWidthClass] === 'object' ? layout[canvasWidthClass] : {}
      canvasState.sites[canvasSiteKey] = canvasMerge(site, { layout: { [canvasWidthClass]: { ...bucket, [id]: canvasCopy(rect) } } })
      canvasEffective = mergeCanvasState(canvasState, canvasState.sites[canvasSiteKey])
      saveCanvasState()
    }

    function canvasApplySurfaceModes() {
      if (!(canvasSurfaceHost instanceof Element)) return
      for (const id of ['ai-card', 'site-card', 'evidence-card']) {
        const surface = canvasSurface(id)
        if (!(surface instanceof Element)) continue
        const mode = resolveSurfaceMode(canvasWidthClass, id)
        surface.dataset.surfaceMode = mode
        const resizeHandle = surface.querySelector('[data-canvas-resize-handle]')
        if (resizeHandle instanceof HTMLElement) resizeHandle.hidden = mode === 'rail'
        const stored = canvasEffective?.layout?.[canvasWidthClass]?.[id]
        if (mode === 'floating') {
          const viewport = canvasViewport()
          const defaultKey = id === 'ai-card' ? 'aiCard' : id === 'site-card' ? 'siteCard' : 'evidenceCard'
          const configured = canvasEffective?.surfaceDefaults?.[defaultKey] || CANVAS_DEFAULT_SURFACES[defaultKey] || {}
          const minimum = id === 'ai-card' ? { width: 320, height: 260 } : { width: 240, height: 160 }
          const fallback = {
            x: Math.max(0, viewport.width - Math.max(minimum.width, Number(configured.width) || 420) - 24),
            y: 88,
            width: Number(configured.width) || 420,
            height: Number(configured.height) || 560,
          }
          const rect = clampSurfaceRect(stored || fallback, viewport, minimum)
          surface.style.left = `${rect.x}px`
          surface.style.top = `${rect.y}px`
          surface.style.width = String(rect.width) + 'px'
          if (id === 'site-card' && !stored) surface.style.removeProperty('height')
          else surface.style.height = String(rect.height) + 'px'
          surface.style.right = 'auto'
          surface.style.bottom = 'auto'
        } else if (mode === 'rail') {
          for (const prop of ['left', 'top', 'width', 'height', 'right', 'bottom']) surface.style.removeProperty(prop)
          const statusOwnsSiteCard = id === 'site-card' && canvasWidthClass === 'wide'
          surface.hidden = statusOwnsSiteCard
          surface.setAttribute('aria-hidden', String(statusOwnsSiteCard))
          surface.setAttribute('data-canvas-surface-state', statusOwnsSiteCard ? 'closed' : 'open')
        } else {
          for (const prop of ['left', 'top', 'width', 'height', 'right', 'bottom']) surface.style.removeProperty(prop)
        }
      }
      const statusHost = canvasSurface('site-status')?.querySelector('[data-canvas-site-status-host]')
      if (statusHost instanceof Element && canvasWidthClass !== 'wide') canvasSiteStatusSetExpanded(statusHost, false, false)
      if (canvasWidthClass === 'wide') canvasSyncSiteSidebar()
    }

    function canvasEndDrag(commit = true) {
      const state = canvasDragState
      if (!state) return
      if (canvasDragRaf) {
        const cancel = window.cancelAnimationFrame || window.clearTimeout
        cancel(canvasDragRaf)
        canvasDragRaf = 0
      }
      window.removeEventListener('pointermove', state.move)
      window.removeEventListener('pointerup', state.up)
      window.removeEventListener('pointercancel', state.cancel || state.up)
      state.surface.removeAttribute('data-canvas-dragging')
      const finalRect = clampSurfaceRect({
        ...state.start,
        x: state.start.x + (state.kind === 'resize' ? 0 : state.dx),
        y: state.start.y + (state.kind === 'resize' ? 0 : state.dy),
        width: state.start.width + (state.kind === 'resize' ? state.dx : 0),
        height: state.start.height + (state.kind === 'resize' ? state.dy : 0),
      }, canvasViewport(), { width: 320, height: 220 })
      state.surface.style.transform = ''
      if (commit) {
        state.surface.style.left = `${finalRect.x}px`
        state.surface.style.top = `${finalRect.y}px`
        if (state.kind === 'resize') {
          state.surface.style.width = `${finalRect.width}px`
          state.surface.style.height = `${finalRect.height}px`
        }
        canvasPersistSurfaceRect(state.id, finalRect)
      } else {
        state.surface.style.left = `${state.start.x}px`
        state.surface.style.top = `${state.start.y}px`
        if (state.kind === 'resize') {
          if (state.styleWidth) state.surface.style.width = state.styleWidth
          else state.surface.style.removeProperty('width')
          if (state.styleHeight) state.surface.style.height = state.styleHeight
          else state.surface.style.removeProperty('height')
        }
      }
      state.surface.releasePointerCapture?.(state.pointerId)
      canvasDragState = null
    }

    function canvasBeginDrag(event, surface) {
      if (!(surface instanceof Element) || surface.dataset.surfaceMode !== 'floating') return
      if (event.button != null && event.button !== 0) return
      if (event.target?.closest?.('[data-canvas-close],button,input,textarea,select,a')) return
      const start = canvasSurfaceRect(surface)
      const pointerId = event.pointerId
      const state = { id: surface.getAttribute('data-surface') || '', surface, start, dx: 0, dy: 0, pointerId, move: null, up: null }
      state.move = (moveEvent) => {
        if (pointerId != null && moveEvent.pointerId != null && moveEvent.pointerId !== pointerId) return
        state.dx = Number(moveEvent.clientX || 0) - Number(event.clientX || 0)
        state.dy = Number(moveEvent.clientY || 0) - Number(event.clientY || 0)
        if (canvasDragRaf) return
        const raf = window.requestAnimationFrame || ((fn) => window.setTimeout(fn, 0))
        canvasDragRaf = raf(() => {
          canvasDragRaf = 0
          if (state.kind === 'resize') {
            surface.style.width = `${Math.max(1, Math.round(state.start.width + state.dx))}px`
            surface.style.height = `${Math.max(1, Math.round(state.start.height + state.dy))}px`
          } else {
            surface.style.transform = `translate3d(${Math.round(state.dx)}px,${Math.round(state.dy)}px,0)`
          }
        })
      }
      state.up = () => canvasEndDrag(true)
      state.cancel = () => canvasEndDrag(false)
      canvasDragState = state
      surface.dataset.canvasDragging = 'true'
      surface.setPointerCapture?.(pointerId)
      window.addEventListener('pointermove', state.move)
      window.addEventListener('pointerup', state.up, { once: true })
      window.addEventListener('pointercancel', state.cancel, { once: true })
      event.preventDefault?.()
    }

    function canvasBeginResize(event, surface) {
      if (!(surface instanceof Element) || surface.dataset.surfaceMode !== 'floating') return
      if (event.button != null && event.button !== 0) return
      const start = canvasSurfaceRect(surface)
      const pointerId = event.pointerId
      const state = { id: surface.getAttribute('data-surface') || '', surface, start, styleWidth: surface.style.width, styleHeight: surface.style.height, dx: 0, dy: 0, pointerId, kind: 'resize', move: null, up: null }
      state.move = (moveEvent) => {
        if (pointerId != null && moveEvent.pointerId != null && moveEvent.pointerId !== pointerId) return
        state.dx = Number(moveEvent.clientX || 0) - Number(event.clientX || 0)
        state.dy = Number(moveEvent.clientY || 0) - Number(event.clientY || 0)
        if (canvasDragRaf) return
        const raf = window.requestAnimationFrame || ((fn) => window.setTimeout(fn, 0))
        canvasDragRaf = raf(() => {
          canvasDragRaf = 0
          surface.style.width = `${Math.max(1, Math.round(state.start.width + state.dx))}px`
          surface.style.height = `${Math.max(1, Math.round(state.start.height + state.dy))}px`
        })
      }
      state.up = () => canvasEndDrag(true)
      state.cancel = () => canvasEndDrag(false)
      canvasDragState = state
      surface.dataset.canvasDragging = 'true'
      surface.setPointerCapture?.(pointerId)
      window.addEventListener('pointermove', state.move)
      window.addEventListener('pointerup', state.up, { once: true })
      window.addEventListener('pointercancel', state.cancel, { once: true })
      event.preventDefault?.()
    }

    function canvasKeyboardMove(event, surface) {
      if (!(surface instanceof Element) || surface.dataset.surfaceMode !== 'floating') return
      const id = surface.getAttribute('data-surface') || ''
      const current = canvasSurfaceRect(surface)
      const step = event.shiftKey ? 16 : 8
      let next = { ...current }
      if (event.shiftKey && event.key === 'ArrowLeft') next.width -= step
      else if (event.shiftKey && event.key === 'ArrowRight') next.width += step
      else if (event.shiftKey && event.key === 'ArrowUp') next.height -= step
      else if (event.shiftKey && event.key === 'ArrowDown') next.height += step
      else if (event.key === 'ArrowLeft') next.x -= step
      else if (event.key === 'ArrowRight') next.x += step
      else if (event.key === 'ArrowUp') next.y -= step
      else if (event.key === 'ArrowDown') next.y += step
      else if (event.key === 'Home') {
        canvasZIndex += 1
        surface.style.zIndex = String(8010 + canvasZIndex)
        event.preventDefault()
        return
      }
      else if (event.key === 'End') {
        surface.style.zIndex = '8000'
        event.preventDefault()
        return
      }
      else if (event.key === 'Escape') { canvasCloseSurface(id); return }
      else return
      event.preventDefault()
      const clean = clampSurfaceRect(next, canvasViewport(), { width: 320, height: 220 })
      surface.style.left = `${clean.x}px`
      surface.style.top = `${clean.y}px`
      canvasPersistSurfaceRect(id, clean)
    }

    function canvasScrollSync() {
      canvasScrollRaf = 0
      const y = canvasScrollY()
      const status = canvasSurface('top-status')
      if (!status) return
      const previous = canvasScrollLast
      const down = y > previous + 2
      const up = y < previous - 2
      canvasScrollLast = y
      if (down || up) status.dataset.compact = down && y > 48 ? 'true' : 'false'
      canvasUpdateProfileScroll(y, previous)
    }

    function canvasHomeScrollRoot() {
      const root = document.documentElement
      const canvasMode = root.classList.contains('lsb-canvas-mode')
      if (!root.classList.contains('lsb-skin-shell-on')) return null
      if (!root.classList.contains('lsb-skin-shell-home')) return null
      if (canvasMode) {
        if (!root.classList.contains('lsb-canvas-page-home')) return null
        if (canvasViewport().width < 700) return null
      } else if (!asideWide()) {
        return null
      }
      const panel = canvasMode
        ? document.querySelector('.lsb-canvas-content-root > .home-shell .main-panel')
        : document.querySelector('body > main.wrap .home-shell .main-panel')
      return panel instanceof Element ? panel : null
    }

    function canvasScrollRoot() {
      return canvasHomeScrollRoot() || (contentScroller instanceof Element ? contentScroller : null)
    }

    function canvasSyncScrollTarget() {
      const next = canvasScrollRoot()
      syncShellScrollBridge(next)
      if (next === canvasScrollTarget) return
      const previousTarget = canvasScrollTarget
      const carryX = !(previousTarget instanceof Element) && next instanceof Element
        ? Number(window.scrollX || document.documentElement?.scrollLeft || 0)
        : 0
      const carryY = !(previousTarget instanceof Element) && next instanceof Element
        ? Number(window.scrollY || document.documentElement?.scrollTop || 0)
        : 0
      if (previousTarget instanceof Element && canvasScrollHandler) {
        previousTarget.removeEventListener('scroll', canvasScrollHandler)
      }
      canvasScrollTarget = next
      if (canvasScrollTarget instanceof Element) {
        if (carryX > 0 && Number(canvasScrollTarget.scrollLeft || 0) === 0) canvasScrollTarget.scrollLeft = carryX
        if (carryY > 0 && Number(canvasScrollTarget.scrollTop || 0) === 0) canvasScrollTarget.scrollTop = carryY
        if (canvasScrollHandler) canvasScrollTarget.addEventListener('scroll', canvasScrollHandler, { passive: true })
      }
      canvasScrollLast = canvasScrollY()
    }

    function canvasScrollY() {
      if (canvasScrollTarget instanceof Element) return Number(canvasScrollTarget.scrollTop || 0)
      return Number(window.scrollY || document.documentElement?.scrollTop || 0)
    }

    function canvasUpdateProfileScroll(y, previous) {
      const host = document.querySelector('[data-lsb-canvas-profile]')
      if (!(host instanceof Element) || api.page?.type !== 'user') return
      // 资料卡已经收窄到原生选项的内容宽度，完整链接始终可见，不再因滚动折叠。
      canvasProfileExpanded = false
      canvasProfileScrollMode = 'full'
      host.dataset.scrollMode = canvasProfileScrollMode
      host.dataset.expanded = String(canvasProfileExpanded)
    }

    function canvasScheduleScroll() {
      if (canvasScrollRaf) return
      const raf = window.requestAnimationFrame || ((fn) => window.setTimeout(fn, 0))
      canvasScrollRaf = raf(canvasScrollSync)
    }

    function canvasBindWindow() {
      if (canvasScrollBound) return
      canvasScrollBound = true
      canvasScrollHandler = canvasScheduleScroll
      canvasResizeHandler = () => {
        canvasWidthClass = widthClass(canvasViewport().width)
        canvasApplyPageClass()
        canvasApplySurfaceModes()
        canvasScheduleScroll()
      }
      window.addEventListener('scroll', canvasScrollHandler, { passive: true })
      window.addEventListener('resize', canvasResizeHandler)
      canvasSyncScrollTarget()
      canvasScrollLast = canvasScrollY()
      canvasUpdateProfileScroll(canvasScrollLast, canvasScrollLast)
    }

    function canvasUnbindWindow() {
      if (!canvasScrollBound) return
      canvasScrollBound = false
      if (canvasScrollHandler) window.removeEventListener('scroll', canvasScrollHandler)
      if (canvasResizeHandler) window.removeEventListener('resize', canvasResizeHandler)
      canvasScrollTarget?.removeEventListener('scroll', canvasScrollHandler)
      canvasScrollHandler = null
      canvasResizeHandler = null
      canvasScrollTarget = null
      if (canvasScrollRaf) {
        const cancel = window.cancelAnimationFrame || window.clearTimeout
        cancel(canvasScrollRaf)
        canvasScrollRaf = 0
      }
    }

    function canvasSearchSetOpen(host, open, restoreFocus = false) {
      if (!(host instanceof Element)) return false
      const trigger = host.querySelector('[data-canvas-search-trigger]')
      const panel = host.querySelector('[data-canvas-search-panel]')
      if (!(trigger instanceof HTMLElement) || !(panel instanceof HTMLElement)) return false
      const next = !!open && !!panel.querySelector('form, .search-page-link')
      host.dataset.searchOpen = String(next)
      panel.hidden = !next
      trigger.setAttribute('aria-expanded', String(next))
      trigger.setAttribute('aria-label', next ? '关闭站点搜索' : '打开站点搜索')
      if (next) {
        const input = panel.querySelector('input[type="search"], input[name="q"]')
        input?.focus?.()
      } else if (restoreFocus) {
        trigger.focus?.()
      }
      return next
    }

    function canvasUnbindEvents() {
      if (canvasSearchOutsideHandler) {
        document.removeEventListener('click', canvasSearchOutsideHandler, true)
        canvasSearchOutsideHandler = null
      }
    }

    function canvasBindEvents() {
      if (!(canvasSurfaceHost instanceof Element) || canvasSurfaceHost.dataset.canvasEventsBound === '1') return
      canvasSurfaceHost.dataset.canvasEventsBound = '1'
      canvasSurfaceHost.addEventListener('click', (event) => {
        const searchTrigger = event.target.closest?.('[data-canvas-search-trigger]')
        if (searchTrigger) {
          event.preventDefault()
          const host = searchTrigger.closest('[data-canvas-search-host]')
          canvasSearchSetOpen(host, host?.dataset.searchOpen !== 'true')
          return
        }
        if (event.target.closest?.('[data-canvas-backdrop]')) {
          event.preventDefault()
          canvasCloseSurface()
          return
        }
        const back = event.target.closest?.('[data-canvas-back]')
        if (back) {
          event.preventDefault()
          if (history.length > 1) history.back()
          return
        }
        const close = event.target.closest?.('[data-canvas-close]')
        if (close) {
          event.preventDefault()
          canvasCloseSurface(close.closest('[data-surface]')?.getAttribute('data-surface') || canvasActiveSheet)
          return
        }
        const contextAction = event.target.closest?.('[data-context-action]')
        if (contextAction) {
          event.preventDefault()
          canvasNativeAction(contextAction.getAttribute('data-context-action') || '')
          canvasCloseContextPill(true)
          return
        }
        const siteStatusHost = event.target.closest?.('[data-canvas-site-status-host]')
        if (siteStatusHost && !event.target.closest?.('[data-canvas-site-status-body]')) {
          event.preventDefault()
          const next = siteStatusHost.dataset.locked !== 'true'
          canvasSiteStatusSetExpanded(siteStatusHost, next, next)
          canvasActiveSheet = next ? 'site-card' : ''
          return
        }
        const pluginSettingsAction = event.target.closest?.('[data-plugin-settings-open], [data-plugin-settings-entry]')
        if (pluginSettingsAction) {
          event.preventDefault()
          openPluginSettings(
            pluginSettingsAction.getAttribute('data-plugin-settings-open')
            || pluginSettingsAction.getAttribute('data-plugin-settings-entry')
            || '',
          )
          return
        }
        const pluginFeatureAction = event.target.closest?.('[data-plugin-feature-action]')
        if (pluginFeatureAction) {
          event.preventDefault()
          openPluginFeature(pluginFeatureAction.getAttribute('data-plugin-feature-action') || '')
          return
        }
        const settingsDirectory = event.target.closest?.('[data-plugin-settings-directory]')
        if (settingsDirectory) {
          event.preventDefault()
          canvasOpenSurface('plugin-settings-sheet', settingsDirectory)
          return
        }
        const settingsBack = event.target.closest?.('[data-plugin-settings-back]')
        if (settingsBack) {
          event.preventDefault()
          canvasOpenSurface('plugin-features-sheet', settingsBack)
          return
        }
        const action = event.target.closest?.('[data-canvas-open]')
        if (action) {
          event.preventDefault()
          canvasOpenSurface(action.getAttribute('data-canvas-open'), action)
          return
        }
        const tool = event.target.closest?.('[data-tool-action]')
        if (tool) {
          event.preventDefault()
          const target = tool.getAttribute('data-tool-action')
          canvasCloseSurface('tool-sheet', false)
          canvasOpenSurface(target, tool)
          return
        }
      })
      canvasSearchOutsideHandler = (event) => {
        const host = canvasSurfaceHost?.querySelector('[data-canvas-search-host]')
        if (host?.dataset.searchOpen !== 'true' || host.contains(event.target)) return
        canvasSearchSetOpen(host, false)
      }
      document.addEventListener('click', canvasSearchOutsideHandler, true)
      canvasSurfaceHost.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          const searchHost = canvasSurfaceHost.querySelector('[data-canvas-search-host]')
          if (searchHost?.dataset.searchOpen === 'true') {
            event.preventDefault()
            event.stopPropagation()
            canvasSearchSetOpen(searchHost, false, true)
            return
          }
        }
        if (event.key === 'Escape' && canvasDragState) {
          event.preventDefault()
          canvasEndDrag(false)
          return
        }
        if (event.key === 'Escape' && canvasActiveSheet) {
          event.preventDefault()
          canvasCloseSurface(canvasActiveSheet)
        }
        const surface = event.target.closest?.('[data-surface]')
        if (surface) canvasKeyboardMove(event, surface)
      })
      canvasSurfaceHost.addEventListener('pointerdown', (event) => {
        const surface = event.target.closest?.('[data-surface]')
        const handle = event.target.closest?.('[data-canvas-sheet-head]')
        const resize = event.target.closest?.('[data-canvas-resize-handle]')
        if (surface && resize) canvasBeginResize(event, surface)
        else if (surface && handle) canvasBeginDrag(event, surface)
      })
    }

    function ensureCanvasShell() {
      let el = document.getElementById('lsb-shell')
      if (el && el.getAttribute('data-lsb-canvas-shell') !== 'true') el.remove()
      el = document.getElementById('lsb-shell')
      if (!el) {
        el = document.createElement('div')
        el.id = 'lsb-shell'
        el.setAttribute('data-lsb-canvas-shell', 'true')
        el.innerHTML = `
          <div id="lsb-shell-surfaces" data-lsb-canvas-surfaces>
            <div data-canvas-backdrop hidden aria-hidden="true"></div>
            <div data-canvas-profile-host hidden aria-label="当前用户资料">
              <button type="button" data-canvas-profile-expand aria-expanded="false" aria-label="展开个人资料卡" title="展开个人资料卡">⌄</button>
            </div>
            <section data-surface="top-status" role="status" aria-live="polite">
              <button type="button" data-canvas-action data-canvas-back aria-label="返回">‹</button>
              <a class="lsb-shell-brand" data-canvas-home href="/" aria-label="回到首页">⌂</a>
              <strong data-canvas-status-title>LINUX SB</strong>
              <nav data-canvas-status-links aria-label="站点快捷入口"></nav>
              <nav data-canvas-pinned-links aria-label="认证与导航"></nav>
              <div data-canvas-search-host hidden aria-label="站点搜索">
                <button type="button" data-canvas-search-trigger aria-label="打开站点搜索" aria-expanded="false" aria-controls="lsb-canvas-search-panel">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.6"></circle><path d="m16 16 4.5 4.5"></path></svg>
                </button>
                <div id="lsb-canvas-search-panel" data-canvas-search-panel role="dialog" aria-label="站点搜索" hidden></div>
              </div>
              <button type="button" data-canvas-open="tool-sheet" data-canvas-action aria-label="打开工具">⋯</button>
            </section>
            <section data-surface="site-status" aria-label="站点信息栏" hidden>
              <div data-canvas-site-status-host aria-label="站点信息" data-expanded="false" data-locked="false">
                <button type="button" data-canvas-site-status-label aria-expanded="false">站点信息</button>
                <div data-canvas-site-status-body data-canvas-site-sidebar aria-label="原站右侧栏"><p data-canvas-site-empty-state hidden>当前页面没有原生站点信息栏内容</p></div>
                <button type="button" data-canvas-site-status-expand aria-expanded="false" aria-label="展开站点信息" title="展开站点信息">⌄</button>
              </div>
            </section>
            <section data-surface="tool-capsule" aria-label="工具入口">
              ${CANVAS_AI_MARKUP.capsule}
              <button type="button" data-canvas-open="tool-sheet" aria-label="更多工具">⋯</button>
            </section>
            <section data-surface="tool-sheet" role="dialog" aria-modal="false" aria-hidden="true" aria-labelledby="lsb-canvas-tool-title" hidden>
              <div data-canvas-sheet-head><span data-canvas-sheet-grabber aria-hidden="true"></span><h2 id="lsb-canvas-tool-title">工具</h2><button type="button" data-canvas-close aria-label="关闭">×</button></div>
              <div data-tool-grid>
                <button type="button" data-tool-action="site-card">站点信息</button>
                ${CANVAS_AI_MARKUP.tool}
                <button type="button" data-tool-action="appearance-sheet">外观</button>
                <button type="button" data-tool-action="plugin-features-sheet">插件功能</button>
              </div>
              ${CANVAS_AI_MARKUP.query}
            </section>
            <section data-surface="plugin-features-sheet" role="dialog" aria-hidden="true" aria-labelledby="lsb-canvas-plugin-features-title" hidden>
              <div data-canvas-sheet-head><span data-canvas-sheet-grabber aria-hidden="true"></span><h2 id="lsb-canvas-plugin-features-title">插件功能</h2><button type="button" data-canvas-close aria-label="关闭">×</button></div>
              <section aria-labelledby="lsb-canvas-plugin-feature-list-title">
                <h3 id="lsb-canvas-plugin-feature-list-title">功能入口</h3>
                <div data-plugin-feature-list></div>
              </section>
              <section aria-labelledby="lsb-canvas-plugin-settings-title">
                <h3 id="lsb-canvas-plugin-settings-title">插件设置</h3>
                <p class="lsb-row-desc">浏览所有已声明设置项的插件。</p>
                <button type="button" data-plugin-settings-directory>全部插件设置</button>
              </section>
            </section>
            <section data-surface="plugin-settings-sheet" role="dialog" aria-hidden="true" aria-labelledby="lsb-canvas-plugin-settings-sheet-title" hidden>
              <div data-canvas-sheet-head><span data-canvas-sheet-grabber aria-hidden="true"></span><h2 id="lsb-canvas-plugin-settings-sheet-title">全部插件设置</h2><button type="button" data-canvas-close aria-label="关闭">×</button></div>
              <button type="button" data-plugin-settings-back>返回插件功能</button>
              <div data-plugin-settings-list></div>
            </section>
            <section data-surface="navigation-sheet" role="dialog" aria-hidden="true" aria-labelledby="lsb-canvas-navigation-title" hidden>
              <div data-canvas-sheet-head><span data-canvas-sheet-grabber aria-hidden="true"></span><h2 id="lsb-canvas-navigation-title">导航</h2><button type="button" data-canvas-close aria-label="关闭">×</button></div>
              <nav data-canvas-navigation-list aria-label="站点板块"></nav>
            </section>
            <section data-surface="site-card" role="dialog" aria-hidden="true" aria-labelledby="lsb-canvas-site-title" hidden>
              <div data-canvas-sheet-head><span data-canvas-sheet-grabber aria-hidden="true"></span><h2 id="lsb-canvas-site-title">站点信息</h2><button type="button" data-canvas-close aria-label="关闭">×</button></div>
              <div data-canvas-site-sidebar aria-label="原站右侧栏"><p data-canvas-site-empty-state hidden>当前页面没有原生站点信息栏内容</p></div>
              <span data-canvas-resize-handle role="separator" aria-label="调整站点卡片大小"></span>
            </section>
            <section data-surface="context-pill" role="toolbar" aria-label="选中文本操作" aria-hidden="true" hidden>
              <button type="button" data-context-action="reply">回复</button>
              <button type="button" data-context-action="quote">引用</button>
              <button type="button" data-context-action="favorite">收藏</button>
              <button type="button" data-context-action="copy">复制</button>
            </section>
            ${CANVAS_AI_MARKUP.card}
            <section data-surface="appearance-sheet" role="dialog" aria-hidden="true" aria-labelledby="lsb-canvas-appearance-title" hidden>
              <div data-canvas-sheet-head><span data-canvas-sheet-grabber aria-hidden="true"></span><h2 id="lsb-canvas-appearance-title">外观</h2><button type="button" data-canvas-close aria-label="关闭">×</button></div>
              <div data-canvas-presets role="group" aria-label="外观预设">
                <button type="button" data-canvas-preset="native-site">D 原生站点</button>
                <button type="button" data-canvas-preset="balanced-glass">A 平衡玻璃</button>
                <button type="button" data-canvas-preset="immersive-video">B 沉浸视频</button>
                <button type="button" data-canvas-preset="static-readable">C 静态可读</button>
              </div>
              <div data-canvas-background-modes role="group" aria-label="背景模式">
                <strong>背景</strong>
                <button type="button" data-canvas-background="original" aria-pressed="false">原始背景</button>
                <button type="button" data-canvas-background="image" aria-pressed="false">静态图片</button>
                <button type="button" data-canvas-background="video" aria-pressed="false">视频背景</button>
              </div>
              <div data-canvas-appearance-controls>
                <label>透明度 <input type="range" min="0.35" max="1" step="0.01" data-canvas-appearance="opacity"></label>
                <label>模糊 <input type="range" min="0" max="32" step="1" data-canvas-appearance="blur"></label>
                <label>字号 <input type="range" min="12" max="32" step="1" data-canvas-appearance="fontSize"></label>
                <label>圆角 <input type="range" min="8" max="32" step="1" data-canvas-appearance="radius"></label>
                <label>系统字体 <select data-canvas-appearance="fontFamily"><option value="">站点默认</option><option value="system-ui">System UI</option><option value="'PingFang SC'">苹方</option><option value="'Microsoft YaHei'">微软雅黑</option><option value="'Segoe UI'">Segoe UI</option></select></label>
                <label>视频 URL（HTTPS） <input type="url" data-canvas-appearance="backgroundVideoUrl"></label>
                <label>图片 URL（HTTPS） <input type="url" data-canvas-appearance="backgroundImageUrl"></label>
                <label>字体 URL（HTTPS） <input type="url" data-canvas-appearance="fontUrl"></label>
                <label>本地视频（≤50MB） <input type="file" accept="video/*" data-canvas-media-file="video"></label>
                <label>本地图片（≤20MB） <input type="file" accept="image/*" data-canvas-media-file="image"></label>
                <label>本地字体（≤10MB） <input type="file" accept=".woff2,.woff,.ttf,.otf,font/*" data-canvas-media-file="font"></label>
              </div>
              <div data-canvas-appearance-actions><button type="button" data-canvas-save-appearance>保存外观</button><button type="button" data-canvas-reset-appearance>恢复默认外观</button><button type="button" data-canvas-reset-layout>恢复默认布局</button></div>
              <p data-canvas-appearance-status aria-live="polite"></p>
            </section>
          </div>`
        document.body.append(el)
      }
      canvasShell = el
      canvasSurfaceHost = el.querySelector('#lsb-shell-surfaces')
      canvasBindSiteStatus(canvasSurfaceHost.querySelector('[data-canvas-site-status-host]'))
      canvasBindEvents()
      canvasBindSelection()
      return el
    }

    function canvasSyncAppearance(feedback = '') {
      if (!(canvasSurfaceHost instanceof Element)) return
      const appearance = canvasEffective?.appearance || {}
      const status = canvasSurface('appearance-sheet')?.querySelector('[data-canvas-appearance-status]')
      const presetLabels = {
        'native-site': 'D 原生站点',
        'balanced-glass': 'A 平衡玻璃',
        'immersive-video': 'B 沉浸视频',
        'static-readable': 'C 静态可读',
      }
      if (status) status.textContent = feedback || `当前预设：${presetLabels[canvasEffective?.preset] || presetLabels['balanced-glass']}`
      for (const button of canvasSurface('appearance-sheet')?.querySelectorAll('[data-canvas-preset]') || []) {
        button.setAttribute('aria-pressed', button.getAttribute('data-canvas-preset') === (canvasEffective?.preset || 'balanced-glass') ? 'true' : 'false')
      }
      const backgroundMode = String(appearance.background || 'static') === 'image'
        ? 'image'
        : String(appearance.background || 'static') === 'video' ? 'video' : 'original'
      for (const button of canvasSurface('appearance-sheet')?.querySelectorAll('[data-canvas-background]') || []) {
        button.setAttribute('aria-pressed', button.getAttribute('data-canvas-background') === backgroundMode ? 'true' : 'false')
      }
      for (const input of canvasSurface('appearance-sheet')?.querySelectorAll('[data-canvas-appearance]') || []) {
        const key = input.getAttribute('data-canvas-appearance')
        if (!key || document.activeElement === input) continue
        if (appearance[key] != null) input.value = String(appearance[key])
      }
      const siteSummary = canvasSurface('site-card')?.querySelector('[data-canvas-site-summary]')
      if (siteSummary) siteSummary.textContent = `${canvasSiteKey.replace(/^https?:\/\//, '')} · ${locationText()}`
      canvasShell?.style.setProperty('--lsb-canvas-current-opacity', String(appearance.opacity ?? .72))
    }

    function canvasCommitAppearanceControls() {
      const controls = canvasSurface('appearance-sheet')?.querySelectorAll('[data-canvas-appearance]') || []
      const values = [...controls].map((input) => [input.getAttribute('data-canvas-appearance'), input.value])
      for (const [key, value] of values) {
        const input = [...controls].find((node) => node.getAttribute('data-canvas-appearance') === key)
        if (!key || String(canvasEffective?.appearance?.[key] ?? '') === String(value ?? '')) continue
        canvasSetAppearance(key, value, { defer: true })
      }
      saveCanvasState()
      applyShellTokens()
      canvasSyncAppearance()
      syncShellMedia()
    }

    function canvasSaveAppearance() {
      if (!canvasState) return
      canvasCommitAppearanceControls()
      canvasSyncAppearance('\u5916\u89c2\u5df2\u4fdd\u5b58')
    }

    function canvasSetAppearance(name, value, options = {}) {
      const key = String(name || '')
      if (!CANVAS_DEFAULT_APPEARANCE.hasOwnProperty(key) || !canvasState) return
      let next = value
      if (['opacity', 'blur', 'fontSize', 'radius'].includes(key)) {
        const n = Number(value)
        if (!Number.isFinite(n)) return
        const bounds = { opacity: [.35, 1], blur: [0, 32], fontSize: [12, 32], radius: [8, 32] }[key]
        next = Math.min(bounds[1], Math.max(bounds[0], n))
      }
      if (['textColor', 'panelColor', 'accentColor'].includes(key)) {
        const text = String(value || '').trim()
        if (!text) next = ''
        else {
          const valid = shellStyleApi?.sanitizeTokenValue?.(key, text)
          if (!valid) return
          next = text
        }
      }
      if (key === 'fontFamily') {
        if (!value) next = ''
        else {
          const valid = shellStyleApi?.sanitizeTokenValue?.('fontFamily', value)
          if (!valid) return
          next = String(value)
        }
      }
      if (['backgroundVideoUrl', 'backgroundImageUrl', 'fontUrl'].includes(key)) {
        if (value && !api.ui.shellMedia?.isHttpsUrl?.(value)) return
        next = String(value || '').trim()
      }
      const site = canvasState.sites[canvasSiteKey] || {}
      const appearancePatch = { [key]: next }
      if (key === 'backgroundVideoUrl' && next) {
        appearancePatch.background = 'video'
        appearancePatch.backgroundImageUrl = ''
        appearancePatch.backgroundImageLocalKey = ''
      }
      if (key === 'backgroundImageUrl' && next) {
        appearancePatch.background = 'image'
        appearancePatch.backgroundVideoUrl = ''
        appearancePatch.backgroundVideoLocalKey = ''
      }
      if (key === 'backgroundVideoUrl' && !next) appearancePatch.background = 'static'
      if (key === 'backgroundImageUrl' && !next) appearancePatch.background = 'static'
      canvasState.sites[canvasSiteKey] = canvasMerge(site, { appearance: appearancePatch })
      canvasEffective = mergeCanvasState(canvasState, canvasState.sites[canvasSiteKey])
      if (options.defer) return
      saveCanvasState()
      applyShellTokens()
      canvasSyncAppearance()
      syncShellMedia()
    }

    function canvasSetBackgroundMode(mode) {
      if (!canvasState) return
      const nextMode = ['image', 'video'].includes(String(mode)) ? String(mode) : 'static'
      const site = canvasState.sites[canvasSiteKey] || {}
      const appearancePatch = {
        background: nextMode,
        ...(nextMode === 'static' || nextMode === 'video' ? { backgroundImageUrl: '', backgroundImageLocalKey: '' } : {}),
        ...(nextMode === 'static' || nextMode === 'image' ? { backgroundVideoUrl: '', backgroundVideoLocalKey: '' } : {}),
      }
      canvasState.sites[canvasSiteKey] = canvasMerge(site, { appearance: appearancePatch })
      canvasEffective = mergeCanvasState(canvasState, canvasState.sites[canvasSiteKey])
      saveCanvasState()
      canvasSyncAppearance()
      syncShellMedia()
    }

    async function canvasSaveMediaFile(kind, file) {
      if (!file || !api.ui.shellMedia?.validateMediaFile) return
      const check = api.ui.shellMedia.validateMediaFile(file, { kind })
      if (!check.ok) {
        api.ui.toast?.(kind === 'video' ? '视频文件超过 50MB 或类型不受支持' : kind === 'image' ? '图片文件超过 20MB 或类型不受支持' : '字体文件超过 10MB 或类型不受支持', { type: 'error' })
        return
      }
      try {
        const db = await ensureMediaDb()
        if (!db || !api.ui.shellMedia.writeMedia) throw new Error('media-store-unavailable')
        const key = mediaOriginKey(kind)
        await api.ui.shellMedia.writeMedia({ db, kind, key, value: file })
        const field = kind === 'video' ? 'backgroundVideoLocalKey' : kind === 'image' ? 'backgroundImageLocalKey' : 'fontLocalKey'
        const site = canvasState?.sites?.[canvasSiteKey] || {}
        const appearancePatch = {
          [field]: key,
          ...(kind === 'video' ? { background: 'video', backgroundVideoUrl: '', backgroundImageUrl: '', backgroundImageLocalKey: '' } : {}),
          ...(kind === 'image' ? { background: 'image', backgroundImageUrl: '', backgroundVideoUrl: '', backgroundVideoLocalKey: '' } : {}),
        }
        canvasState.sites[canvasSiteKey] = canvasMerge(site, { appearance: appearancePatch })
        canvasEffective = mergeCanvasState(canvasState, canvasState.sites[canvasSiteKey])
        saveCanvasState()
        canvasSyncAppearance()
        syncShellMedia()
        api.ui.toast?.('本地资源已保存并应用', { type: 'success' })
      } catch {
        api.ui.toast?.('本地资源保存失败，已保留当前外观', { type: 'error' })
      }
    }

    function canvasChoosePreset(preset) {
      if (!canvasState || !['native-site', 'balanced-glass', 'immersive-video', 'static-readable'].includes(preset)) return
      const values = {
        'native-site': { opacity: 1, blur: 0, background: 'static', backgroundVideoUrl: '', backgroundVideoLocalKey: '', backgroundImageUrl: '', backgroundImageLocalKey: '', fontFamily: '', fontUrl: '', fontLocalKey: '', fontSize: 14, textColor: '', panelColor: '', accentColor: '', radius: 16, motion: 'auto', transparency: 'reduced' },
        'balanced-glass': { opacity: .72, blur: 18, background: 'static', backgroundVideoUrl: '', backgroundVideoLocalKey: '', backgroundImageUrl: '', backgroundImageLocalKey: '', textColor: '', panelColor: '', accentColor: '', motion: 'auto', transparency: 'auto' },
        'immersive-video': { opacity: .56, blur: 22, background: 'video', backgroundVideoUrl: '', backgroundVideoLocalKey: '', backgroundImageUrl: '', backgroundImageLocalKey: '', textColor: '', panelColor: '', accentColor: '', motion: 'auto', transparency: 'auto' },
        'static-readable': { opacity: .94, blur: 0, background: 'static', backgroundVideoUrl: '', backgroundVideoLocalKey: '', backgroundImageUrl: '', backgroundImageLocalKey: '', textColor: '', panelColor: '', accentColor: '', motion: 'reduced', transparency: 'reduced' },
      }[preset]
      const site = canvasState.sites?.[canvasSiteKey]
      if (site?.appearance) {
        const next = { ...site }
        delete next.appearance
        canvasState.sites[canvasSiteKey] = next
      }
      canvasState.global = canvasMerge(canvasState.global, { preset, appearance: values })
      canvasEffective = mergeCanvasState(canvasState, canvasState.sites?.[canvasSiteKey] || {})
      saveCanvasState()
      applyShellTokens()
      canvasSyncAppearance()
      syncShellMedia()
    }

    function canvasResetAppearance() {
      if (!canvasState) return
      const site = canvasState.sites[canvasSiteKey]
      if (site?.appearance) {
        const next = { ...site }
        delete next.appearance
        canvasState.sites[canvasSiteKey] = next
      }
      canvasState.global = canvasMerge(canvasState.global, { preset: 'balanced-glass', appearance: canvasCopy(CANVAS_DEFAULT_APPEARANCE) })
      canvasEffective = mergeCanvasState(canvasState, canvasState.sites?.[canvasSiteKey] || {})
      saveCanvasState()
      applyShellTokens()
      canvasSyncAppearance()
      syncShellMedia()
    }

    function canvasResetLayout() {
      if (!canvasState) return
      const site = canvasState.sites[canvasSiteKey]
      if (site?.layout) {
        const next = { ...site }
        delete next.layout
        canvasState.sites[canvasSiteKey] = next
      }
      canvasEffective = mergeCanvasState(canvasState, canvasState.sites?.[canvasSiteKey] || {})
      saveCanvasState()
      canvasApplySurfaceModes()
    }

    function mountCanvas() {
      const outlet = findRouteOutlet()
      if (!(outlet instanceof Element)) return null
      /* Keep the document-start bootstrap opaque until the real canvas and all
         of its surfaces have been created.  Removing it before ensureCanvasShell
         lets the native route paint for one frame during a full-page topic hop. */
      canvasApplyPageClass()
      markNative(true)
      const el = ensureCanvasShell()
      if (!(el instanceof Element) || !(el.querySelector('#lsb-shell-surfaces') instanceof Element)) return null
      adoptSearch(el.querySelector('[data-canvas-search-host]'))
      adoptThemeToggle(el.querySelector('[data-lsb-shell-theme]'))
      /* Keep the real self card in the reading flow.  The native sidebar
         remains hidden in place; only the card is temporarily adopted by the
         inline slot and is restored before route content is stashed. */
      canvasMountProfile(outlet)
      canvasWatchSidebar()
      canvasSyncText()
      canvasSyncAppearance()
      canvasApplySurfaceModes()
      if (canvasWidthClass === 'wide' || canvasActiveSheet === 'site-card') canvasSyncSiteSidebar()
      else canvasSyncPersistentSiteCards()
      canvasBindWindow()
      canvasScheduleScroll()
      const presets = canvasSurface('appearance-sheet')?.querySelectorAll('[data-canvas-preset]') || []
      for (const button of presets) {
        if (button.dataset.canvasBound === '1') continue
        button.dataset.canvasBound = '1'
        button.addEventListener('click', () => canvasChoosePreset(button.getAttribute('data-canvas-preset')))
      }
      const backgroundButtons = canvasSurface('appearance-sheet')?.querySelectorAll('[data-canvas-background]') || []
      for (const button of backgroundButtons) {
        if (button.dataset.canvasBound === '1') continue
        button.dataset.canvasBound = '1'
        button.addEventListener('click', () => canvasSetBackgroundMode(button.getAttribute('data-canvas-background')))
      }
      const controls = canvasSurface('appearance-sheet')?.querySelectorAll('[data-canvas-appearance]') || []
      for (const input of controls) {
        if (input.dataset.canvasBound === '1') continue
        input.dataset.canvasBound = '1'
        const update = () => {
          canvasSetAppearance(input.getAttribute('data-canvas-appearance'), input.value)
        }
        input.addEventListener(input.type === 'range' ? 'input' : 'change', update)
      }
      const mediaInputs = canvasSurface('appearance-sheet')?.querySelectorAll('[data-canvas-media-file]') || []
      for (const input of mediaInputs) {
        if (input.dataset.canvasBound === '1') continue
        input.dataset.canvasBound = '1'
        input.addEventListener('change', () => {
          const file = input.files?.[0]
          void canvasSaveMediaFile(input.getAttribute('data-canvas-media-file'), file).finally(() => { input.value = '' })
        })
      }
      const resetAppearance = canvasSurface('appearance-sheet')?.querySelector('[data-canvas-reset-appearance]')
      const resetLayout = canvasSurface('appearance-sheet')?.querySelector('[data-canvas-reset-layout]')
      const saveAppearance = canvasSurface('appearance-sheet')?.querySelector('[data-canvas-save-appearance]')
      if (saveAppearance && saveAppearance.dataset.canvasBound !== '1') {
        saveAppearance.dataset.canvasBound = '1'
        saveAppearance.addEventListener('click', canvasSaveAppearance)
      }
      if (resetAppearance && resetAppearance.dataset.canvasBound !== '1') {
        resetAppearance.dataset.canvasBound = '1'
        resetAppearance.addEventListener('click', canvasResetAppearance)
      }
      if (resetLayout && resetLayout.dataset.canvasBound !== '1') {
        resetLayout.dataset.canvasBound = '1'
        resetLayout.addEventListener('click', canvasResetLayout)
      }
      document.documentElement.classList.remove('lsb-canvas-boot')
      document.getElementById('lsb-shell-boot-frame')?.remove()
      return el
    }

    function unmountCanvas() {
      canvasEndDrag(false)
      canvasUnbindWindow()
      canvasUnbindSelection()
      canvasUnbindEvents()
      canvasStopSidebarWatch()
      canvasCloseSurface(canvasActiveSheet, false)
      canvasRestoreSiteSidebar({ releasePersistent: true })
      canvasRestoreProfile()
      restoreCanvasTopLinks()
      canvasSurfaceHost = null
      restoreSearch()
      canvasShell?.remove()
      canvasShell = null
      canvasActiveSheet = ''
      canvasFocusReturn = null
      document.querySelector('.lsb-canvas-content-root')?.classList.remove('lsb-canvas-content-root')
      for (const name of ['canvas-mode', 'lsb-canvas-page-home', 'lsb-canvas-page-forum', 'lsb-canvas-page-topic', 'lsb-canvas-page-user', 'lsb-canvas-page-settings', 'lsb-canvas-page-page']) document.documentElement.classList.remove(name)
    }

    function stripShellWindowChrome(el) {
      if (!(el instanceof Element)) return
      el.querySelector('#lsb-shell-window-content')?.remove()
      el.querySelector('[data-lsb-shell-window-switcher]')?.remove()
      el.querySelectorAll('[data-lsb-shell-window-bar], [data-lsb-shell-window-drag], [data-lsb-shell-window-action], [data-lsb-shell-resize-edge]')
        .forEach((node) => node.remove())
      for (const node of el.querySelectorAll('[data-lsb-shell-window]')) node.removeAttribute('data-lsb-shell-window')
      el.removeAttribute('data-lsb-shell-mode')
    }

    function ensureShell() {
      let el = document.getElementById('lsb-shell')
      if (el) {
        if (el.parentNode !== document.body) document.body.append(el)
        stripShellWindowChrome(el)
        return el
      }
      el = document.createElement('div')
      el.id = 'lsb-shell'
      const nativeBrand = document.querySelector('body > .top a.brand')
      const brandName = 'LINUX SB'
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
        <div id="lsb-shell-workspace" data-lsb-shell-workspace>
        <aside id="lsb-shell-rail" aria-label="氢导航" data-lsb-shell-window="nav">
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
        <aside id="lsb-shell-aside" aria-label="站点信息" data-lsb-shell-window="site">
          <nav id="lsb-shell-aside-tabs" role="tablist" aria-label="右栏视图" hidden></nav>
          <div class="lsb-shell-aside-panes">
            <section data-lsb-shell-aside-pane="site" data-lsb-shell-site aria-label="站点" tabindex="0"></section>
          </div>
        </aside>
        <section id="lsb-shell-window-content" class="lsb-shell-window" data-lsb-shell-window="content" role="region" aria-labelledby="lsb-shell-window-content-title">
          <div class="lsb-shell-window-bar" data-lsb-shell-window-bar>
            <strong id="lsb-shell-window-content-title" class="lsb-shell-window-title">正文</strong>
            <span class="lsb-shell-window-drag" data-lsb-shell-window-drag aria-hidden="true"></span>
            <button type="button" class="lsb-shell-window-action" data-lsb-shell-window-reset aria-label="恢复正文窗口布局" title="恢复布局">↺</button>
          </div>
          <div class="lsb-shell-window-body lsb-shell-window-content-body" data-lsb-shell-window-body></div>
        </section>
        <nav class="lsb-shell-window-switcher" data-lsb-shell-window-switcher role="tablist" aria-label="氢壳窗口切换"></nav>
        </div>`
      stripShellWindowChrome(el)
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
      if (cfg.shell && el?.getAttribute?.('data-lsb-canvas-shell') === 'true') {
        canvasApplyPageClass()
        markNative(true)
        canvasSyncText()
        canvasSyncAppearance()
        canvasApplySurfaceModes()
        canvasWatchSidebar()
        return
      }
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
      syncAsideViews(el)
    }

    function fillShell() {
      if (!(findRouteOutlet() instanceof Element)) return null
      const el = ensureShell()
      if (shellWindowEnabled()) mountShellWindows(el)
      pruneDetachedAsideCards()
      adoptSearch(el.querySelector('.lsb-shell-search-host'))
      adoptTopExtras(el.querySelector('[data-lsb-shell-extras]'))
      adoptThemeToggle(el.querySelector('[data-lsb-shell-theme]'))
      adoptUserCard(el.querySelector('[data-lsb-shell-me]'))
      adoptAsideCards(el.querySelector('[data-lsb-shell-site]'))
      watchOnlineCard()
      watchTopExtras()
      setSection(el.querySelector('[data-lsb-shell-section="home"]'), '', [
        { href: '/', label: '全部主题' },
      ])
      setSection(el.querySelector('[data-lsb-shell-section="boards"]'), '版块', collectBoards())
      setSection(el.querySelector('[data-lsb-shell-section="tools"]'), '工具', collectTools())
      syncShellRoute(el)
      syncShellScrollBridge(canvasHomeScrollRoot() || contentScroller)
      syncHomeInfiniteScroll()
      syncShellMedia()
      return el
    }

    function refreshRouteEnhancements(serial) {
      if (serial !== spaSerial) return false
      applyMarkers()
      fillShell()
      refreshNativeRouteEnhancements()
      scheduleOnlineUserRefresh(0, true, true)
      if (serial !== spaSerial) return false
      try {
        const EventCtor = window.CustomEvent || CustomEvent
        document.dispatchEvent(new EventCtor(SPA_ROUTE_COMMITTED_EVENT, {
          detail: { href: location.href, serial },
        }))
      } catch {
        /* A native enhancement hook is optional and must not block routing. */
      }
      spaFilledSerial = serial
      return true
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

    function rememberHomeInfState(state) {
      if (!state?.list) return
      homeInfRecords.set(state.list, {
        page: state.page,
        loaded: state.loaded,
        seen: state.seen,
        hasMore: state.hasMore,
      })
    }

    function unbindHomeInfiniteScroll() {
      if (!homeInf) return
      const state = homeInf
      rememberHomeInfState(state)
      for (const target of state.scrollTargets || [window]) target.removeEventListener?.('scroll', state.onScroll)
      if (state.scrollTimer) {
        window.clearTimeout(state.scrollTimer)
        state.scrollTimer = 0
      }
      state.status?.remove()
      state.controller?.abort()
      homeInf = null
    }

    function homeInfStateActive(state) {
      if (!state || homeInf !== state || !isHomeInfPath()) return false
      let routeKey
      try {
        routeKey = viewCacheKey(location.href)
      } catch {
        return false
      }
      return (
        state.routeKey === routeKey
        && state.list?.isConnected
        && state.list === document.querySelector('.main-panel > ul.post-list')
        && state.pagination?.isConnected
        && state.pagination === document.querySelector('.pagination-bar')
      )
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
      if (!homeInfStateActive(state) || state.loading || !state.hasMore) return
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
          ...(state.controller?.signal ? { signal: state.controller.signal } : {}),
        })
        if (!homeInfStateActive(state)) return
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const doc = new DOMParser().parseFromString(res.text, 'text/html')
        const remoteList = doc.querySelector('.main-panel > ul.post-list, ul.post-list')
        const items = remoteList
          ? [...remoteList.children].filter((item) => item.matches?.('.post-item') && !item.classList.contains('post-entry'))
          : []
        if (!items.length) {
          state.hasMore = false
          rememberHomeInfState(state)
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
        rememberHomeInfState(state)
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
      const prior = homeInfRecords.get(list)
      const seen = prior?.seen || {}
      if (!prior) {
        for (const item of list.children) {
          if (item.matches?.('.post-item')) {
            const key = homeInfTopicKey(item)
            if (key) seen[key] = true
          }
        }
      }
      const pageFromUrl = parseInt(new URL(location.href).searchParams.get('p'), 10) || 1
      const loaded = prior?.loaded || {}
      loaded[pageFromUrl] = true
      const page = Math.max(pageFromUrl, Number(prior?.page) || pageFromUrl)
      const scrollRoot = canvasHomeScrollRoot()
      const scrollTargets = scrollRoot ? [scrollRoot, window] : [window]
      const onScroll = () => {
        if (!homeInfStateActive(homeInf) || homeInf.loading || !homeInf.hasMore) return
        if (homeInf.scrollTimer) return
        homeInf.scrollTimer = window.setTimeout(() => {
          if (homeInf) homeInf.scrollTimer = 0
          if (!homeInfStateActive(homeInf) || homeInf.list !== list) return
          const rect = list.getBoundingClientRect()
          const root = homeInf.scrollRoot instanceof Element ? homeInf.scrollRoot : null
          const rootRect = root?.getBoundingClientRect?.()
          const viewportBottom = root
            ? (Number(rootRect?.bottom) || Number(rootRect?.top || 0) + Number(root.clientHeight || 0))
            : (window.innerHeight || 0)
          const distance = rect.bottom - viewportBottom
          if (distance <= 100) void loadHomeInfPage()
        }, 80)
      }
      hideHomePagination(pagination)
      homeInf = {
        list,
        pagination,
        routeKey: viewCacheKey(location.href),
        seen,
        loaded,
        page,
        loading: false,
        hasMore: prior ? prior.hasMore : homeInfHasNext(document),
        onScroll,
        scrollRoot,
        scrollTargets,
        scrollTimer: 0,
        status: null,
        controller: typeof AbortController === 'function' ? new AbortController() : null,
      }
      rememberHomeInfState(homeInf)
      if (!homeInf.hasMore) {
        setHomeInfStatus('end', '没有更多内容了')
        return
      }
      for (const target of scrollTargets) target.addEventListener?.('scroll', onScroll, { passive: true })
    }

    function syncHomeInfiniteScroll() {
      if (!cfg.shell || !isHomeInfPath() || !homeInfEnabled()) {
        unbindHomeInfiniteScroll()
        return
      }
      const list = document.querySelector('.main-panel > ul.post-list')
      const pagination = document.querySelector('.pagination-bar')
      if (!list || !pagination || containsTopicPostContent(list)) {
        unbindHomeInfiniteScroll()
        return
      }
      const routeKey = viewCacheKey(location.href)
      const scrollRoot = canvasHomeScrollRoot()
      if (
        homeInf?.list === list
        && homeInf.pagination === pagination
        && homeInf.routeKey === routeKey
        && homeInf.scrollRoot === scrollRoot
      ) return
      unbindHomeInfiniteScroll()
      if (
        pagination.classList.contains('sb-infinite-scroll-pagination-hidden')
        && !pagination.hasAttribute('data-lsb-shell-inf')
        && !(scrollRoot instanceof Element)
      ) return
      bindHomeInfiniteScroll(list, pagination)
    }

    const NATIVE_THREAD_VISIBLE_LIMIT = 5

    function nativeThreadFloor(value) {
      const text = String(value || '')
      return /^[1-9]\d*$/.test(text) ? text : ''
    }

    function nativeThreadParentFromContent(row, replyRows) {
      for (const link of row.querySelectorAll('.post-content a[href]')) {
        try {
          const url = new URL(link.href, location.href)
          const floor = nativeThreadFloor(url.searchParams.get('floor'))
          if (floor) return floor
          const replyId = nativeThreadFloor(url.searchParams.get('replyid') || url.searchParams.get('reply_id'))
          const parentFloor = replyId ? nativeThreadFloor(replyRows.get(replyId)?.dataset.floor) : ''
          if (parentFloor) return parentFloor
        } catch {
          /* A malformed quote link cannot determine a parent. */
        }
      }
      return nativeThreadFloor(String(row.querySelector('.post-content')?.textContent || '').match(/@[^\s#]+\s+#([1-9]\d*)\b/u)?.[1])
    }

    function nativeThreadParentFromForm(form) {
      if (!(form instanceof HTMLFormElement)) return ''
      const explicit = form.dataset.quoteThreadsParentFloor
        || form.querySelector('[name="quote_threads_parent_floor"], [name="parent_floor"], [data-quote-threads-parent-floor]')?.value
      const explicitFloor = nativeThreadFloor(explicit)
      if (explicitFloor) return explicitFloor
      const body = form.querySelector('textarea[name="body"], textarea[name="content"], [contenteditable="true"]')
      const text = 'value' in (body || {}) ? body.value : body?.textContent
      return nativeThreadFloor(String(text || '').match(/@[^ #]+ +#([1-9][0-9]*)/u)?.[1])
    }

    function nativeThreadReplyId(row) {
      return String(row?.id || '').match(/^post-([1-9][0-9]*)$/)?.[1] || ''
    }

    function addNativeThreadReference(row, parentFloor) {
      const floor = nativeThreadFloor(parentFloor)
      if (!(row instanceof Element) || !floor) return
      const meta = row.querySelector('.post-meta')
      if (!(meta instanceof Element)) return
      let reference = meta.querySelector(':scope > .quote-threads-reference')
      if (!reference) {
        reference = document.createElement('span')
        reference.className = 'quote-threads-reference'
        meta.prepend(reference)
      }
      reference.textContent = `回复 #${floor}`
      reference.dataset.quoteThreadsParentFloor = floor
    }

    function normalizeNativeThreadLinks(rows, byFloor) {
      const currentTopic = topicSpaUrl(location.href)
      if (!currentTopic) return
      const normalize = (link, ownReplyId = '') => {
        if (!(link instanceof HTMLAnchorElement)) return
        let url
        try {
          url = new URL(link.getAttribute('href') || link.href, location.href)
        } catch {
          return
        }
        if (url.origin !== currentTopic.origin || url.pathname !== currentTopic.pathname) return
        const floor = nativeThreadFloor(url.searchParams.get('floor'))
        const replyId = ownReplyId || (floor ? nativeThreadReplyId(byFloor.get(floor)) : '')
        if (!replyId) return
        url.searchParams.delete('floor')
        url.searchParams.delete('p')
        url.searchParams.delete('reply_id')
        url.searchParams.set('replyid', replyId)
        link.setAttribute('href', url.href)
      }
      for (const row of rows) {
        const ownReplyId = nativeThreadReplyId(row)
        for (const link of row.querySelectorAll('a[href]')) normalize(link, link.classList.contains('post-floor') ? ownReplyId : '')
      }
    }

    function handleNativeReplySubmit(event) {
      const form = event.target instanceof HTMLFormElement
        ? event.target
        : event.target?.closest?.('form.ajax-reply-form')
      if (!(form instanceof HTMLFormElement)) return
      const parentFloor = nativeThreadParentFromForm(form)
      if (parentFloor) nativeReplyParentByForm.set(form, parentFloor)
    }

    function handleNativeReplySaved(event) {
      const detail = event.detail && typeof event.detail === 'object' ? event.detail : {}
      const form = detail.form instanceof HTMLFormElement ? detail.form : null
      const replyCandidate = detail.reply || detail.post || detail.element || event.target
      const reply = replyCandidate instanceof Element
        ? (replyCandidate.matches('li.post-item.post-entry') ? replyCandidate : replyCandidate.closest('li.post-item.post-entry'))
        : null
      if (!reply) return
      const parentFloor = nativeThreadFloor(nativeReplyParentByForm.get(form))
        || nativeThreadFloor(reply.dataset.quoteThreadsParentFloor)
        || nativeThreadParentFromContent(reply, new Map())
      if (parentFloor) reply.dataset.quoteThreadsParentFloor = parentFloor
      const list = reply.closest('ul.post-list.topic-post-list') || nativeThreadList
      if (list) rebuildNativeThreadTree(list)
    }

    function bindNativeThreadLifecycle() {
      if (nativeThreadLifecycleBound) return
      nativeThreadLifecycleBound = true
      document.addEventListener('submit', handleNativeReplySubmit, true)
      document.addEventListener('bbs1:reply-saved', handleNativeReplySaved)
    }

    function unbindNativeThreadLifecycle() {
      if (!nativeThreadLifecycleBound) return
      nativeThreadLifecycleBound = false
      document.removeEventListener('submit', handleNativeReplySubmit, true)
      document.removeEventListener('bbs1:reply-saved', handleNativeReplySaved)
    }

    function renderNativeThreadCollapse(list, root, rootRow, branch) {
      if (!(rootRow instanceof Element) || branch.length <= NATIVE_THREAD_VISIBLE_LIMIT) return
      const containsTarget = branch.some((row) => (
        row.classList.contains('post-highlight')
        || (new URL(location.href).searchParams.get('replyid') && row.id === `post-${new URL(location.href).searchParams.get('replyid')}`)
        || (new URL(location.href).searchParams.get('floor') && row.dataset.floor === new URL(location.href).searchParams.get('floor'))
      ))
      if (containsTarget && rootRow.dataset.quoteThreadsTargetRevealed !== '1') {
        rootRow.dataset.quoteThreadsExpanded = '1'
        rootRow.dataset.quoteThreadsTargetRevealed = '1'
      }
      const expanded = rootRow.dataset.quoteThreadsExpanded === '1'
      branch.forEach((row, index) => {
        row.classList.toggle('quote-threads-is-collapsed', !expanded && index >= NATIVE_THREAD_VISIBLE_LIMIT)
      })
      if (!expanded) {
        branch[branch.length - 1].classList.remove('quote-threads-thread-end')
        branch[NATIVE_THREAD_VISIBLE_LIMIT - 1].classList.add('quote-threads-thread-end')
      }
      const toggleRow = document.createElement('li')
      toggleRow.className = 'quote-threads-toggle-row'
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'quote-threads-toggle'
      button.dataset.quoteThreadsToggle = root
      button.dataset.expanded = expanded ? '1' : '0'
      button.setAttribute('aria-expanded', expanded ? 'true' : 'false')
      button.textContent = expanded ? '收起讨论串' : `展开剩余 ${branch.length - NATIVE_THREAD_VISIBLE_LIMIT} 条回复`
      toggleRow.append(button)
      ;(expanded ? branch[branch.length - 1] : branch[NATIVE_THREAD_VISIBLE_LIMIT - 1]).after(toggleRow)
    }

    function rebuildNativeThreadTree(list) {
      if (!(list instanceof Element)) return
      list.querySelectorAll(':scope > .quote-threads-toggle-row').forEach((row) => row.remove())
      const rows = [...list.querySelectorAll(':scope > li.post-item.post-entry')]
      list.dataset.quoteThreadsCollapseReady = '1'
      if (rows.length < 2) return

      const byFloor = new Map()
      const replyRows = new Map()
      const parents = new Map()
      const roots = new Map()
      const branches = new Map()
      const branchRoots = []

      rows.forEach((row) => {
        row.dataset.quoteThreadsProcessed = '1'
        row.querySelectorAll('.quote-threads-reference').forEach((reference) => reference.remove())
        const floor = nativeThreadFloor(row.dataset.floor)
        if (floor) byFloor.set(floor, row)
        const replyId = String(row.id || '').match(/^post-([1-9][0-9]*)$/)?.[1] || ''
        if (replyId) replyRows.set(replyId, row)
        row.classList.remove(
          'quote-threads-child',
          'quote-threads-cross-page',
          'quote-threads-thread-item',
          'quote-threads-thread-end',
          'quote-threads-is-collapsed',
        )
      })

      rows.forEach((row) => {
        const floor = nativeThreadFloor(row.dataset.floor)
        let parentFloor = nativeThreadFloor(row.dataset.quoteThreadsParentFloor)
        if (!parentFloor) {
          parentFloor = nativeThreadParentFromContent(row, replyRows)
          if (parentFloor) row.dataset.quoteThreadsParentFloor = parentFloor
        }
        if (!floor || !parentFloor || parentFloor === floor) return
        addNativeThreadReference(row, parentFloor)
        if (byFloor.has(parentFloor)) parents.set(floor, parentFloor)
        else row.classList.add('quote-threads-cross-page')
      })
      normalizeNativeThreadLinks(rows, byFloor)

      const rootFloor = (floor) => {
        if (roots.has(floor)) return roots.get(floor)
        const trail = []
        const seen = new Set()
        let current = floor
        let root = floor
        while (true) {
          if (roots.has(current)) {
            root = roots.get(current)
            break
          }
          if (seen.has(current)) break
          seen.add(current)
          trail.push(current)
          const parentFloor = parents.get(current)
          if (!parentFloor) {
            root = current
            break
          }
          current = parentFloor
        }
        trail.forEach((value) => roots.set(value, root))
        return root
      }

      rows.forEach((row, index) => {
        const floor = nativeThreadFloor(row.dataset.floor)
        const root = floor ? rootFloor(floor) : `@${index}`
        if (!branches.has(root)) {
          branches.set(root, [])
          branchRoots.push(root)
        }
        branches.get(root).push(row)
      })

      const orderedRows = []
      const collapsibleBranches = []
      for (const root of branchRoots) {
        const rootRow = byFloor.get(root)
        const storedBranch = branches.get(root)
        const branch = rootRow && storedBranch.length > 1
          ? [rootRow, ...storedBranch.filter((row) => row !== rootRow)]
          : storedBranch
        if (rootRow && branch.length > 1) {
          branch.forEach((row) => {
            row.classList.add('quote-threads-thread-item')
            if (row !== rootRow) row.classList.add('quote-threads-child')
          })
          branch[branch.length - 1].classList.add('quote-threads-thread-end')
          collapsibleBranches.push([root, rootRow, branch])
        } else if (branch.length === 1 && branch[0].classList.contains('quote-threads-cross-page')) {
          branch[0].classList.add('quote-threads-thread-item', 'quote-threads-child', 'quote-threads-thread-end')
        }
        branch.forEach((row) => orderedRows.push(row))
      }

      if (!rows.every((row, index) => row === orderedRows[index])) {
        const fragment = document.createDocumentFragment()
        orderedRows.forEach((row) => fragment.append(row))
        list.append(fragment)
      }
      collapsibleBranches.forEach(([root, rootRow, branch]) => renderNativeThreadCollapse(list, root, rootRow, branch))
    }

    function clearNativeThreadObserver() {
      nativeThreadObserver?.disconnect?.()
      nativeThreadObserver = null
      nativeThreadList = null
      if (nativeThreadApplyTimer) {
        window.clearTimeout(nativeThreadApplyTimer)
        nativeThreadApplyTimer = 0
      }
    }

    function observeNativeThreadTree(list) {
      if (!(list instanceof Element)) {
        clearNativeThreadObserver()
        return
      }
      bindNativeThreadLifecycle()
      if (nativeThreadList === list && nativeThreadObserver) {
        rebuildNativeThreadTree(list)
        return
      }
      clearNativeThreadObserver()
      nativeThreadList = list
      if (list.dataset.lsbNativeThreadBound !== '1') {
        list.dataset.lsbNativeThreadBound = '1'
        list.addEventListener('click', (event) => {
          const button = event.target?.closest?.('[data-quote-threads-toggle]')
          if (!(button instanceof HTMLButtonElement)) return
          const root = nativeThreadFloor(button.dataset.quoteThreadsToggle)
          const rootRow = [...list.querySelectorAll(':scope > li.post-item.post-entry')]
            .find((row) => nativeThreadFloor(row.dataset.floor) === root)
          if (!rootRow) return
          rootRow.dataset.quoteThreadsExpanded = button.dataset.expanded === '1' ? '0' : '1'
          rebuildNativeThreadTree(list)
        })
      }
      rebuildNativeThreadTree(list)
      if (typeof MutationObserver !== 'function') return
      nativeThreadObserver = new MutationObserver((records) => {
        const hasNewReply = records.some((record) => [...record.addedNodes].some((node) => (
          node instanceof Element
          && (node.matches('li.post-item.post-entry') || !!node.querySelector('li.post-item.post-entry'))
          && [...(node.matches('li.post-item.post-entry') ? [node] : node.querySelectorAll('li.post-item.post-entry'))]
            .some((reply) => reply.dataset.quoteThreadsProcessed !== '1')
        )))
        if (hasNewReply && !nativeThreadApplyTimer) {
          nativeThreadApplyTimer = window.setTimeout(() => {
            nativeThreadApplyTimer = 0
            if (nativeThreadList === list && list.isConnected) rebuildNativeThreadTree(list)
          }, 0)
        }
      })
      nativeThreadObserver.observe(list, { childList: true, subtree: true })
    }

    function nativeCapVerificationSetStatus(root, message, error = false) {
      const status = root?.querySelector?.('[data-cap-verification-status]')
      if (!(status instanceof HTMLElement)) return
      status.textContent = message
      if (error) status.setAttribute('data-cap-error', '1')
      else status.removeAttribute('data-cap-error')
    }

    function nativeCapVerificationLoad(root) {
      const scriptUrl = root?.getAttribute?.('data-cap-widget-script') || ''
      const wasmUrl = root?.getAttribute?.('data-cap-wasm-url') || ''
      if (wasmUrl) window.CAP_CUSTOM_WASM_URL = wasmUrl
      if (window.__capVerificationWidgetPromise) return Promise.resolve(window.__capVerificationWidgetPromise)
      if (window.customElements?.get?.('cap-widget')) return Promise.resolve()
      if (!scriptUrl) return Promise.resolve()
      try {
        const promise = import(scriptUrl)
        window.__capVerificationWidgetPromise = promise
        promise.catch((error) => { window.__capVerificationWidgetError = error })
        return promise
      } catch (error) {
        return Promise.reject(error)
      }
    }

    function prepareNativeCapVerification(root = document) {
      const widgets = []
      if (root?.matches?.('[data-cap-verification]')) widgets.push(root)
      root?.querySelectorAll?.('[data-cap-verification]')?.forEach((widget) => widgets.push(widget))
      for (const widget of widgets) {
        if (widget.dataset.capVerificationBound !== '1') {
          widget.dataset.capVerificationBound = '1'
          const capWidget = widget.querySelector('cap-widget')
          capWidget?.addEventListener?.('solve', () => {
            nativeCapVerificationSetStatus(widget, '人机验证已完成，可以提交。')
          })
          capWidget?.addEventListener?.('error', () => {
            nativeCapVerificationSetStatus(widget, '人机验证失败，请重新验证。', true)
          })
        }
        nativeCapVerificationLoad(widget).then(() => {
          if (!widget.isConnected) return
          const form = widget.closest('form')
          const token = form?.querySelector('input[name="cap_token"]')
          if (!token || !String(token.value || '').trim()) {
            nativeCapVerificationSetStatus(widget, '人机验证已加载，请完成验证。')
          }
        }).catch(() => {
          nativeCapVerificationSetStatus(widget, '人机验证加载失败，请刷新页面后重试。', true)
        })
      }
    }

    function nativeCaptchaHex(buffer) {
      return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, '0')).join('')
    }

    async function solveNativeCaptcha(widget) {
      if (!(widget instanceof Element) || !widget.isConnected) return false
      const epoch = nativeCaptchaEpoch
      const powInput = widget.querySelector('input[name="native_captcha_pow"]')
      if (!powInput || powInput.value) return true
      const status = widget.querySelector('[data-native-captcha-status]')
      if (widget.dataset.powRequired === '0') {
        if (status) status.textContent = '微信浏览器已免除浏览器校验'
        return true
      }
      const generation = widget.dataset.powGeneration || ''
      const prefix = widget.dataset.powPrefix || ''
      const zeroes = Math.max(2, Math.min(5, Number(widget.dataset.powZeroes || 3)))
      const cryptoApi = window.crypto
      const TextEncoderCtor = window.TextEncoder || globalThis.TextEncoder
      if (!cryptoApi?.subtle || typeof TextEncoderCtor !== 'function') {
        if (status) status.textContent = '当前浏览器不支持浏览器校验，请换用新版浏览器'
        return false
      }
      const target = '0'.repeat(zeroes)
      const encoder = new TextEncoderCtor()
      if (status) status.textContent = '校验准备中…'
      for (let i = 0; i < 2000000; i += 1) {
        const nonce = i.toString(16)
        const digest = nativeCaptchaHex(await cryptoApi.subtle.digest('SHA-256', encoder.encode(`${prefix}:${nonce}`)))
        if (epoch !== nativeCaptchaEpoch || !widget.isConnected) return false
        if (digest.slice(0, zeroes) === target) {
          if ((widget.dataset.powGeneration || '') !== generation) return false
          powInput.value = nonce
          if (status) status.textContent = '校验已就绪'
          return true
        }
        if (i > 0 && i % 250 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0))
      }
      if (status) status.textContent = '浏览器校验准备超时，请刷新页面后重试'
      return false
    }

    function prepareNativeCaptcha(root = document) {
      const widgets = []
      if (root?.matches?.('[data-native-captcha]')) widgets.push(root)
      root?.querySelectorAll?.('[data-native-captcha]')?.forEach((widget) => widgets.push(widget))
      for (const widget of widgets) {
        if (nativeCaptchaSolvers.has(widget)) continue
        const task = solveNativeCaptcha(widget)
        nativeCaptchaSolvers.set(widget, task)
        task.then(
          () => {
            if (nativeCaptchaSolvers.get(widget) === task) nativeCaptchaSolvers.delete(widget)
          },
          () => {
            if (nativeCaptchaSolvers.get(widget) === task) nativeCaptchaSolvers.delete(widget)
          },
        )
      }
    }

    function clearNativeCaptchaObserver() {
      nativeCaptchaEpoch += 1
      nativeCaptchaObserver?.disconnect?.()
      nativeCaptchaObserver = null
      if (nativeCaptchaApplyTimer) {
        window.clearTimeout(nativeCaptchaApplyTimer)
        nativeCaptchaApplyTimer = 0
      }
    }

    function bindNativeCaptchaObserver() {
      if (nativeCaptchaObserver || typeof MutationObserver !== 'function' || !document.body) return
      nativeCaptchaObserver = new MutationObserver((records) => {
        const roots = []
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (!(node instanceof Element)) continue
            const hasNativeCaptcha = node.matches('[data-native-captcha]') || !!node.querySelector('[data-native-captcha]')
            const hasCapVerification = node.matches('[data-cap-verification]') || !!node.querySelector('[data-cap-verification]')
            if (hasNativeCaptcha || hasCapVerification) roots.push(node)
          }
        }
        if (!roots.length || nativeCaptchaApplyTimer) return
        nativeCaptchaApplyTimer = window.setTimeout(() => {
          nativeCaptchaApplyTimer = 0
          roots.forEach((root) => {
            prepareNativeCaptcha(root)
            prepareNativeCapVerification(root)
          })
        }, 0)
      })
      nativeCaptchaObserver.observe(document.body, { childList: true, subtree: true })
    }

    function refreshNativeRouteEnhancements() {
      observeNativeThreadTree(document.querySelector('ul.post-list.topic-post-list'))
      prepareNativeCaptcha(document)
      prepareNativeCapVerification(document)
      bindNativeCaptchaObserver()
      syncOnlineUserDots()
      watchOnlineUserDots()
      startOnlineUserRefresh()
    }

    function findRouteOutlet(scope = document) {
      if (isCloudflareChallengeDocument(scope)) return null
      const candidates = [
        scope.querySelector?.('[data-slot~="page.before_render"]'),
        scope.querySelector?.('main.wrap'),
        scope.querySelector?.('main'),
      ]
      for (const el of candidates) {
        if (!el || el.id === 'lsb-shell' || el.querySelector?.('#lsb-shell')) continue
        return el
      }
      return null
    }

    function containsTopicPostContent(root) {
      return !!root?.matches?.('ul.topic-post-list, li.post-entry')
        || !!root?.querySelector?.('ul.topic-post-list, li.post-entry')
    }

    function hideNativeSidebars(root) {
      if (!root?.querySelectorAll) return
      for (const el of root.querySelectorAll('aside.sidebar, [data-slot~="sidebar.stack"]')) {
        if (el.id === 'mobile-menu-drawer' || el.classList.contains('mobile-menu-drawer')) continue
        el.classList.add('lsb-native-sidebar-hidden')
      }
      for (const el of nativeLeftRails(root)) el.classList.add('lsb-native-left-hidden')
    }

    function topicSpaUrl(urlLike) {
      if (!cfg.shell || cfg.topicSpa !== true) return null
      let url
      try {
        url = new URL(urlLike, location.href)
      } catch {
        return null
      }
      if (url.origin !== location.origin) return null
      const path = url.pathname.replace(/\/{2,}/g, '/') || '/'
      const match = path.match(/^\/topic\/([1-9]\d*)\/?$/)
      if (!match || !Number.isSafeInteger(Number(match[1]))) return null
      return url
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
      // 帖子阅读路由只由 topicSpaUrl 判定；关闭试验开关时仍整页导航。
      if (topicSpaUrl(url.href)) return true
      if (/^\/topic(?:\/|$)/.test(path)) return false
      // 淘帖详情仍靠站点脚本在整页生命周期里挂载；不能用软跳剥掉脚本。
      if (/^\/topic_collection\/\d+\/?$/.test(path)) return false
      return (
        path === '/'
        || path === '/index.php'
        || path === '/topic_featured'
        || path === '/hot_discussions'
        || path === '/unread_topic_notice_footprint'
        || path === '/topic_collections'
        || path === '/topic_essence_review_list'
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
        const normalized = new URL(key, location.origin).href
        if (!isSpaUrl(normalized)) return
        canvasSyncPersistentSiteCards()
        if (topicSpaUrl(normalized)) return
      } catch {
        return
      }
      /* Non-persistent cards are temporarily mounted outside their native
         sidebar while the canvas is active.  Restore those cards before moving
         the route outlet into the SPA cache; persistent cards stay mounted in
         the canvas and keep their hidden origin markers. */
      restoreAsideCards()
      canvasStopSidebarWatch()
      canvasRestoreSiteSidebar()
      canvasRestoreProfile()
      restoreDetachedNativeSidebars()
      const outlet = findRouteOutlet()
      if (!outlet?.firstChild) return
      if (containsTopicPostContent(outlet)) return
      const frag = document.createDocumentFragment()
      while (outlet.firstChild) frag.appendChild(outlet.firstChild)
      rememberView(key, {
        frag,
        title: document.title,
        head: captureRouteHead(),
        scrollX: currentScrollX(),
        scrollY: currentScrollY(),
        live: true,
        attrs: snapshotOutletAttrs(outlet),
      })
    }

    function takeView(key) {
      if (topicSpaUrl(key)) return null
      const entry = viewCache.get(key)
      if (!entry) return null
      viewCache.delete(key)
      return entry
    }

    function applyView(entry, outlet) {
      if (!outlet || !entry?.frag) return
      canvasRestoreSiteSidebar()
      canvasRestoreProfile()
      restoreDetachedNativeSidebars()
      if (entry.attrs) {
        for (const name of [...outlet.getAttributeNames()]) outlet.removeAttribute(name)
        for (const [name, value] of entry.attrs) {
          if (name.startsWith('data-lsb-')) continue
          outlet.setAttribute(name, value)
        }
      }
      outlet.replaceChildren()
      outlet.append(entry.frag)
      canvasRebindPersistentSiteCardOrigins(outlet)
      outlet.setAttribute('tabindex', '-1')
      markRouteContentEnter(outlet)
      if (entry.head) applyRouteHeadSnapshot(entry.head)
      else if (entry.title) document.title = entry.title
      outlet.removeAttribute('aria-busy')
      markNative(true)
    }

    function parseOutletFrag(html) {
      const pageDoc = new DOMParser().parseFromString(html, 'text/html')
      const remote = findRouteOutlet(pageDoc)
      if (!remote) return null
      remote.querySelectorAll('script').forEach((node) => node.remove())
      hideNativeSidebars(remote)
      canvasStagePersistentSiteCardOrigins(remote)
      const frag = document.createDocumentFragment()
      for (const node of [...remote.childNodes]) frag.appendChild(document.importNode(node, true))
      canvasRebindPersistentSiteCardOrigins(frag)
      return { frag, title: pageDoc.title || '', head: routeHeadSnapshot(pageDoc), attrs: snapshotOutletAttrs(remote) }
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
            head: parsed.head,
            scrollX: 0,
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
            head: parsed.head,
            scrollX: 0,
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

    function ensureRouteAnnouncer() {
      const shell = document.getElementById('lsb-shell')
      if (!shell) return null
      let announcer = shell.querySelector('#lsb-route-announcer')
      if (announcer) return announcer
      announcer = document.createElement('span')
      announcer.id = 'lsb-route-announcer'
      announcer.setAttribute('role', 'status')
      announcer.setAttribute('aria-live', 'polite')
      shell.append(announcer)
      return announcer
    }

    function focusAndAnnounceRoute(source) {
      if (source === 'history') return
      const outlet = findRouteOutlet()
      if (!outlet) return
      outlet.setAttribute('tabindex', '-1')
      try {
        outlet.focus({ preventScroll: true })
      } catch {
        outlet.focus?.()
      }
      const announcer = ensureRouteAnnouncer()
      if (announcer) announcer.textContent = `已打开：${document.title}`
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
      }, 220)
    }

    function hideProgress(serial) {
      window.clearTimeout(spaProgressTimer)
      spaProgressTimer = 0
      if (serial !== spaSerial) return
      const el = document.getElementById('lsb-shell-progress')
      if (!el) return
      el.dataset.phase = 'idle'
      el.style.setProperty('--lsb-shell-progress', '0')
    }

    function routeHeadSnapshot(source = document) {
      const read = (selector, attribute) => source.querySelector(selector)?.getAttribute(attribute) ?? null
      return {
        title: source.title || '',
        canonical: read('link[rel="canonical"]', 'href'),
        description: read('meta[name="description"]', 'content'),
        ogTitle: read('meta[property="og:title"]', 'content'),
      }
    }

    function applyRouteHeadSnapshot(snapshot) {
      if (!snapshot) return
      document.title = String(snapshot.title || '')
      const fields = [
        ['link[rel="canonical"]', 'href', 'canonical'],
        ['meta[name="description"]', 'content', 'description'],
        ['meta[property="og:title"]', 'content', 'ogTitle'],
      ]
      for (const [selector, attribute, key] of fields) {
        const node = document.querySelector(selector)
        if (!node) continue
        const value = snapshot[key]
        if (value === null || value === undefined) node.removeAttribute(attribute)
        else node.setAttribute(attribute, String(value))
      }
    }

    function captureRouteHead() {
      return routeHeadSnapshot(document)
    }

    function syncRouteHead(pageDoc) {
      const snapshot = routeHeadSnapshot(pageDoc)
      applyRouteHeadSnapshot(snapshot)
      return snapshot
    }

    function markRouteContentEnter(outlet) {
      if (!outlet) return
      outlet.removeAttribute('data-lsb-route-content-enter')
      void outlet.offsetWidth
      outlet.setAttribute('data-lsb-route-content-enter', '')
    }

    function topicResponseMatches(pageDoc, finalUrl) {
      const target = topicSpaUrl(finalUrl)
      if (!target) return true
      const targetId = Number((target.pathname.match(/^\/topic\/(\d+)/) || [])[1])
      if (!Number.isSafeInteger(targetId) || targetId <= 0) return false
      const canonical = pageDoc.querySelector('link[rel="canonical"]')?.getAttribute('href') || ''
      if (!canonical) return false
      let canonicalUrl
      try {
        canonicalUrl = new URL(canonical, finalUrl)
      } catch {
        return false
      }
      const canonicalTopic = topicSpaUrl(canonicalUrl.href)
      const canonicalId = Number((canonicalTopic?.pathname.match(/^\/topic\/(\d+)/) || [])[1])
      if (!canonicalTopic || canonicalId !== targetId) return false
      const remote = findRouteOutlet(pageDoc)
      const list = remote?.querySelector('ul.topic-post-list')
      const posts = list?.querySelectorAll('li.post-entry:not(.reply-pin-duplicate)')
      return !!remote && !!list && !!posts?.length
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

    function commitRoute(pageDoc, remoteOutlet, targetUrl, historyMode) {
      const outlet = findRouteOutlet()
      if (!outlet || !remoteOutlet) throw new Error('no outlet')
      /* Hide any native chrome before the old outlet is detached.  The shell
         remains the only visible navigation layer for the whole transaction. */
      markNative(true)
      canvasStopSidebarWatch()
      canvasRestoreSiteSidebar()
      canvasRestoreProfile()
      restoreDetachedNativeSidebars()
      remoteOutlet.querySelectorAll('script').forEach((node) => node.remove())
      hideNativeSidebars(remoteOutlet)
      canvasStagePersistentSiteCardOrigins(remoteOutlet)
      const kids = [...remoteOutlet.childNodes].map((node) => document.importNode(node, true))
      applyHistory(targetUrl, historyMode)
      syncRouteHead(pageDoc)
      syncOutletAttrs(outlet, remoteOutlet)
      outlet.replaceChildren(...kids)
      syncOnlineUserBoot(pageDoc)
      canvasRebindPersistentSiteCardOrigins(outlet)
      outlet.setAttribute('tabindex', '-1')
      markRouteContentEnter(outlet)
      outlet.removeAttribute('aria-busy')
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

    function topicTargetId(urlLike = location.href) {
      const url = topicSpaUrl(urlLike)
      if (!url) return ''
      const replyid = url.searchParams.get('replyid') || ''
      if (/^[1-9]\d*$/.test(replyid)) return `#post-${replyid}`
      const floor = url.searchParams.get('floor') || ''
      if (/^[1-9]\d*$/.test(floor)) return `[data-floor="${floor}"]`
      return ''
    }

    function scrollToTopicTarget(urlLike = location.href) {
      const selector = topicTargetId(urlLike)
      let node = null
      if (selector) {
        try {
          node = document.querySelector(selector)
        } catch {
          node = null
        }
      }
      if (node) {
        node.scrollIntoView?.({ block: 'center' })
        return true
      }
      let hash = ''
      try {
        hash = new URL(urlLike, location.href).hash
      } catch {
        return false
      }
      if (!hash) return false
      try {
        const id = decodeURIComponent(hash.slice(1))
        node = document.getElementById(id) || document.querySelector(hash)
      } catch {
        return false
      }
      node?.scrollIntoView?.()
      return !!node
    }

    function currentScrollRoot() {
      if (canvasScrollTarget instanceof Element) return canvasScrollTarget
      if (contentScroller instanceof Element) return contentScroller
      return null
    }

    function currentScrollY() {
      const root = currentScrollRoot()
      const rootY = root ? Number(root.scrollTop || 0) : 0
      if (rootY > 0) return rootY
      return Number(window.scrollY || window.pageYOffset || 0)
    }

    function currentScrollX() {
      const root = currentScrollRoot()
      const rootX = root ? Number(root.scrollLeft || 0) : 0
      if (rootX > 0) return rootX
      return Number(window.scrollX || window.pageXOffset || 0)
    }

    function scrollCurrentRootTo(x = 0, y = 0) {
      const root = currentScrollRoot()
      if (root) {
        const nextX = Math.max(0, Number(x) || 0)
        const nextY = Math.max(0, Number(y) || 0)
        root.scrollLeft = nextX
        root.scrollTop = nextY
        // 保留 window.scrollTo 通知，兼容依赖窗口滚动语义的站点脚本和历史测试；实际滚动仍由面板承载。
        window.scrollTo(nextX, nextY)
        canvasScheduleScroll()
        return
      }
      window.scrollTo(x, y)
    }

    function historyEntryState(url, index, x, y) {
      const prior = history.state && typeof history.state === 'object' ? history.state : {}
      return {
        ...prior,
        lsbShellSpa: true,
        lsbShellSpaIndex: index,
        lsbShellSpaUrl: url,
        lsbScrollX: Number(x) || 0,
        lsbScrollY: Number(y) || 0,
      }
    }

    function readHistoryIndex(state = history.state) {
      const value = Number(state?.lsbShellSpaIndex)
      return Number.isSafeInteger(value) && value >= 0 ? value : null
    }

    function initializeHistoryEntry() {
      const existingIndex = readHistoryIndex()
      spaHistoryIndex = existingIndex ?? 0
      try {
        history.replaceState(
          historyEntryState(location.href, spaHistoryIndex, currentScrollX(), currentScrollY()),
          '',
          location.href,
        )
      } catch {
        /* history 不可用时不阻断正文导航 */
      }
    }

    function rememberHistoryScroll() {
      const index = readHistoryIndex() ?? spaHistoryIndex
      try {
        history.replaceState(
          historyEntryState(location.href, index, currentScrollX(), currentScrollY()),
          '',
          location.href,
        )
        spaHistoryIndex = index
      } catch {
        /* history 不可用时不阻断正文导航 */
      }
    }

    function historyScrollX() {
      const value = Number(history.state?.lsbScrollX)
      return Number.isFinite(value) && value >= 0 ? value : 0
    }

    function historyScrollY() {
      const value = Number(history.state?.lsbScrollY)
      return Number.isFinite(value) && value >= 0 ? value : 0
    }

    function applyHistory(target, mode) {
      if (mode === 'none') return
      const currentIndex = readHistoryIndex() ?? spaHistoryIndex
      const nextIndex = mode === 'replace' ? currentIndex : currentIndex + 1
      const state = historyEntryState(target.href, nextIndex, 0, 0)
      try {
        if (mode === 'replace') history.replaceState(state, '', target.href)
        else history.pushState(state, '', target.href)
        spaHistoryIndex = nextIndex
      } catch {
        /* history 不可用时仍换 DOM，地址栏可能落后 */
      }
    }

    function fallbackRoute(mode, targetUrl) {
      if (mode === 'none') location.reload()
      else if (mode === 'replace') location.replace(targetUrl)
      else location.assign(targetUrl)
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
      const settings = { historyMode: 'push', force: false, source: 'user', ...options }
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

      if (settings.historyMode !== 'none') rememberHistoryScroll()
      const fromKey = spaViewKey
      unbindHomeInfiniteScroll()
      const destKey = viewCacheKey(target.href)
      const cached = takeView(destKey)
      const serial = ++spaSerial
      spaAbortController?.abort()
      const requestController = new AbortController()
      spaAbortController = requestController
      const tTotal = api.hasHandler('perf-probe:record') ? performance.now() : 0
      const outlet = findRouteOutlet()
      holdSpaRouteChrome(serial)
      markNative(true)
      outlet?.setAttribute('aria-busy', 'true')
      setRoutePhase(serial, 'preparing')
      startProgress(serial)
      let committed = false
      try {
        if (cached) {
          setRoutePhase(serial, 'committing')
          stashView(fromKey)
          perfSpan('spa.commit', () => applyView(cached, findRouteOutlet() || outlet))
          committed = true
          applyHistory(target, settings.historyMode)
          spaViewKey = destKey
          scheduleHomeStashRefresh()
          perfSpan('spa.fillShell', () => {
            applyMarkers()
            fillShell()
          })
          spaFilledSerial = serial
          window.clearTimeout(refreshTimer)
          refreshTimer = 0
          hideProgress(serial)
          try {
            scrollCurrentRootTo(
              settings.historyMode === 'none' ? historyScrollX() : 0,
              settings.historyMode === 'none' ? historyScrollY() : 0,
            )
          } catch {
            /* jsdom 没有视口 */
          }
          if (tTotal) perfEmit('spa.total', performance.now() - tTotal)
          afterPaint(() => {
            if (serial !== spaSerial) return
            setRoutePhase(serial, 'settling')
            try {
              perfSpan('spa.notify', () => {
                notifyRoute()
                if (!refreshRouteEnhancements(serial)) return
                syncShellRoute()
                scrollToTopicTarget(target.href)
                focusAndAnnounceRoute(settings.source)
              })
            } finally {
              settleSpaRoute(serial)
            }
            try {
              api.emitGlobal('spa:view-restored', { href: destKey, live: !!cached.live })
            } catch {
              /* 实时流缺席不得打断壳 */
            }
          })
          return true
        }

        setRoutePhase(serial, 'fetching')
        const res = await perfSpanAsync('spa.fetch', () =>
          api.net.raw(`${target.pathname}${target.search}`, {
            queue: false,
            timeout: 15000,
            retry: 0,
            signal: requestController.signal,
          }),
        )
        if (serial !== spaSerial) return false
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const finalUrl = new URL(res.url || target.href, target.href)
        if (!finalUrl.hash && target.hash) finalUrl.hash = target.hash
        if (!isSpaUrl(finalUrl.href)) {
          hideProgress(serial)
          outlet?.removeAttribute('aria-busy')
          settleSpaRoute(serial)
          fallbackRoute(settings.historyMode, finalUrl.href)
          return false
        }
        const pageDoc = perfSpan('spa.parse', () => new DOMParser().parseFromString(res.text, 'text/html'))
        const remoteOutlet = findRouteOutlet(pageDoc)
        if (!remoteOutlet) throw new Error('no remote outlet')
        if (!topicResponseMatches(pageDoc, finalUrl)) throw new Error('invalid topic response')
        setRoutePhase(serial, 'committing')
        stashView(fromKey)
        perfSpan('spa.commit', () => {
          commitRoute(pageDoc, remoteOutlet, finalUrl, settings.historyMode)
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
          scrollCurrentRootTo(
            settings.historyMode === 'none' ? historyScrollX() : 0,
            settings.historyMode === 'none' ? historyScrollY() : 0,
          )
        } catch {
          /* jsdom 没有视口 */
        }
        if (tTotal) perfEmit('spa.total', performance.now() - tTotal)
        afterPaint(() => {
          if (serial !== spaSerial) return
          setRoutePhase(serial, 'settling')
          try {
            perfSpan('spa.notify', () => {
              notifyRoute()
              if (!refreshRouteEnhancements(serial)) return
              syncShellRoute()
              scrollToTopicTarget(finalUrl.href)
              focusAndAnnounceRoute(settings.source)
            })
          } finally {
            settleSpaRoute(serial)
          }
        })
        return true
      } catch (err) {
        if (serial !== spaSerial) return false
        hideProgress(serial)
        settleSpaRoute(serial)
        outlet?.removeAttribute('aria-busy')
        const aborted = requestController.signal.aborted || err?.name === 'AbortError'
        if (!committed && !aborted) fallbackRoute(settings.historyMode, target.href)
        return false
      } finally {
        if (spaAbortController === requestController) spaAbortController = null
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
      ) return
      const currentTopic = !!topicSpaUrl(location.href)
      const targetTopic = !!topicSpaUrl(anchor.href)
      if (anchor.closest('.pagination-bar, .pagination') && (!currentTopic || !targetTopic)) return
      if (!isSpaUrl(anchor.href)) return
      if (anchor.href === location.href) {
        if (cancelPendingSpaNavigation()) event.preventDefault()
        return
      }
      event.preventDefault()
      void navigateSpa(anchor.href)
    }

    function onSpaSubmit(event) {
      if (event.defaultPrevented || !cfg.shell) return
      const form = event.target instanceof HTMLFormElement ? event.target : null
      if (!form || String(form.method || 'get').toLowerCase() !== 'get') return
      if (form.target && form.target !== '_self') return
      if (form.matches('[data-no-spa], [data-confirm], [data-method]')) return
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
      const targetIndex = readHistoryIndex()
      if (spaHistoryRollbackIndex !== null) {
        const rollbackIndex = spaHistoryRollbackIndex
        spaHistoryRollbackIndex = null
        if (targetIndex === rollbackIndex) {
          spaHistoryIndex = rollbackIndex
          return
        }
      }
      const previousIndex = spaHistoryIndex
      if (hasUnsavedEditor() && !window.confirm('当前编辑内容尚未保存，确定离开吗？')) {
        spaHistoryRollbackIndex = previousIndex
        const delta = targetIndex === null ? 1 : previousIndex - targetIndex
        try {
          history.go(delta)
        } catch {
          spaHistoryRollbackIndex = null
        }
        return
      }
      if (targetIndex !== null) spaHistoryIndex = targetIndex
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
      let targetHref = location.href
      try {
        const recorded = new URL(history.state?.lsbShellSpaUrl || '', location.href)
        if (recorded.origin === location.origin && recorded.href === location.href) targetHref = recorded.href
      } catch {
        /* 地址栏仍是该历史项的权威目标 */
      }
      void navigateSpa(targetHref, { historyMode: 'none', force: true, source: 'history' })
    }

    function clearSpaTransaction() {
      spaSerial += 1
      spaHistoryRollbackIndex = null
      const controller = spaAbortController
      spaAbortController = null
      controller?.abort()
      window.clearTimeout(spaProgressTimer)
      spaProgressTimer = 0
      findRouteOutlet()?.removeAttribute('aria-busy')
      clearSpaRouteChromeHold()
      const root = document.documentElement
      delete root.dataset.lsbRoutePhase
      const progress = document.getElementById('lsb-shell-progress')
      if (progress) {
        progress.dataset.phase = 'idle'
        progress.style.setProperty('--lsb-shell-progress', '0')
      }
    }

    function cancelPendingSpaNavigation() {
      const root = document.documentElement
      const pending = !!spaAbortController
        || root.hasAttribute('data-lsb-route-phase')
        || root.classList.contains(SPA_ROUTE_PENDING_CLASS)
      if (!pending) return false
      clearSpaTransaction()
      try {
        spaViewKey = viewCacheKey(location.href)
      } catch {
        spaViewKey = ''
      }
      if (cfg.shell) {
        applyMarkers()
        if (document.getElementById('lsb-shell')) fillShell()
        else syncHomeInfiniteScroll()
        refreshNativeRouteEnhancements()
      }
      return true
    }

    function onSpaPageShow(event) {
      if (event.persisted) clearSpaTransaction()
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
      window.addEventListener('pageshow', onSpaPageShow)
      document.addEventListener('visibilitychange', onHomeStashVisible)
      initializeHistoryEntry()
      spaViewKey = viewCacheKey(location.href)
      seedHomeView()
      scheduleHomeStashRefresh()
    }

    function unbindSpa() {
      if (!spaBound) return
      spaBound = false
      clearSpaTransaction()
      document.removeEventListener('click', onSpaClick, true)
      document.removeEventListener('submit', onSpaSubmit, true)
      window.removeEventListener('popstate', onSpaPop)
      window.removeEventListener('pageshow', onSpaPageShow)
      document.removeEventListener('visibilitychange', onHomeStashVisible)
      stopHomeStashRefresh()
      homeStashPending = false
      homeStashGen += 1
      document.getElementById('lsb-shell-progress')?.remove()
    }

    function unmountShellLayer({ preserveBootStyle = false } = {}) {
      clearSpaTransaction()
      clearNativeThreadObserver()
      unbindNativeThreadLifecycle()
      clearNativeCaptchaObserver()
      if (timelineRaf) {
        const cancel = window.cancelAnimationFrame || window.clearTimeout
        cancel(timelineRaf)
        timelineRaf = 0
      }
      clearSpaRouteChromeHold()
      delete document.documentElement.dataset.lsbRoutePhase
      unbindWindow()
      unbindWindowInteractions()
      unbindAsideResize()
      stopOnlineWatch()
      stopExtrasWatch()
      destroyAsideViews()
      unmountCanvas()
      unmountShellWindows()
      mediaGeneration += 1
      backgroundSpecKey = ''
      fontSpecKey = ''
      releaseBackgroundVideo()
      releaseBackgroundImage()
      releaseFontFace()
      mediaDbPromise = null
      restoreAsideCards()
      restoreAsidePersistentCards()
      restoreUserCard()
      restoreTopExtras()
      restoreThemeToggle()
      restoreSearch()
      document.getElementById('lsb-shell')?.remove()
      markNative(false)

      const root = document.documentElement
      root.removeAttribute('data-lsb-shell-mode')
      root.classList.remove(
        'lsb-skin-shell-on', 'lsb-skin-shell-home', 'lsb-skin-shell-topic', 'lsb-skin-shell-user', 'lsb-skin-shell-windowed',
        'lsb-skin-glass-on', 'lsb-skin-video-on', 'lsb-skin-image-on', 'lsb-canvas-mode',
        'lsb-canvas-reduced-motion', 'lsb-canvas-reduced-transparency',
        'lsb-canvas-boot', 'lsb-shell-boot',
      )
      for (const name of ['home', 'forum', 'topic', 'user', 'settings', 'page']) root.classList.remove(`lsb-canvas-page-${name}`)
      for (const prop of shellTokenProps) root.style.removeProperty(prop)
      shellTokenProps.clear()
      root.style.removeProperty('--lsb-shell-font-family')
      if (!preserveBootStyle) document.getElementById('lsb-shell-boot-style')?.remove()
      document.getElementById('lsb-shell-boot-frame')?.remove()
      mountedUiMode = null
    }

    function teardownShell() {
      window.clearTimeout(refreshTimer)
      refreshTimer = 0
      unbindUiModeResize()
      unbindCloudflareChallengeWatch()
      unbindSpa()
      unbindHomeInfiniteScroll()
      stopOnlineUserDots()
      stopOnlineUserRefresh()
      unmountShellLayer()
      viewCache.clear()
      spaViewKey = ''
    }

    function refreshShell() {
      refreshTimer = 0
      if (!cfg.shell) {
        const scrollPosition = pendingUiModeScroll
        pendingUiModeScroll = null
        teardownShell()
        if (scrollPosition) scrollCurrentRootTo(scrollPosition.x, scrollPosition.y)
        return
      }

      bindCloudflareChallengeWatch()
      if (isCloudflareChallengeDocument(document)) {
        const scrollPosition = pendingUiModeScroll
        pendingUiModeScroll = null
        unbindUiModeResize()
        unbindSpa()
        unbindHomeInfiniteScroll()
        stopOnlineUserRefresh()
        unmountShellLayer({ preserveBootStyle: true })
        if (scrollPosition) scrollCurrentRootTo(scrollPosition.x, scrollPosition.y)
        return
      }

      bindUiModeResize()
      const mode = effectiveUiMode()
      const targetMode = mode === 'ios27' || asideWide() ? mode : null
      const modeChanged = mountedUiMode !== targetMode
      const scrollPosition = pendingUiModeScroll || (modeChanged
        ? { x: currentScrollX(), y: currentScrollY() }
        : null)
      pendingUiModeScroll = null
      const hadLayer = mountedUiMode !== null || !!document.getElementById('lsb-shell')
      if (modeChanged && hadLayer) unmountShellLayer()

      if (!targetMode) {
        unbindHomeInfiniteScroll()
        restyle()
        refreshNativeRouteEnhancements()
        bindSpa()
        if (scrollPosition) scrollCurrentRootTo(scrollPosition.x, scrollPosition.y)
        return
      }

      restyle()
      markNative(true)
      bindAsideResize()
      try {
        const mounted = targetMode === 'ios27' ? mountCanvas() : fillShell()
        if (!(mounted instanceof Element)) throw new Error(`${targetMode} shell did not mount`)
        mountedUiMode = targetMode
        refreshNativeRouteEnhancements()
        bindSpa()
        syncShellMedia()
        if (scrollPosition) scrollCurrentRootTo(scrollPosition.x, scrollPosition.y)
      } catch (error) {
        unbindHomeInfiniteScroll()
        unmountShellLayer()
        bindSpa()
        if (scrollPosition) scrollCurrentRootTo(scrollPosition.x, scrollPosition.y)
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn('[LSB skin] shell mount failed; restored native page', error)
        }
      }
    }

    function afterPaint(fn) {
      // One rAF runs before paint; the second lets the committed outlet paint first.
      // Hidden and prerendered documents may pause rAF, so notify without waiting for an invisible frame.
      const requestFrame = window.requestAnimationFrame
      if (typeof requestFrame !== 'function' || document.visibilityState !== 'visible') {
        queueMicrotask(fn)
        return
      }
      requestFrame.call(window, () => requestFrame.call(window, fn))
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

    function renderSkinSettings(host) {
      const section = document.createElement('section')
      section.className = 'lsb-skin-media-settings'
      const heading = document.createElement('h3')
      heading.textContent = '本地资源与窗口布局'
      section.append(heading)
      const hint = document.createElement('p')
      hint.className = 'lsb-row-desc'
      hint.textContent = '视频单文件不超过 50MB，字体单文件不超过 10MB；二进制只保存在本机 IndexedDB。'
      section.append(hint)

      const appendFile = (kind, labelText, accept, configKey, enabledKey = '') => {
        const label = document.createElement('label')
        label.className = 'lsb-field'
        const title = document.createElement('span')
        title.textContent = labelText
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = accept
        input.addEventListener('change', async () => {
          const file = input.files?.[0]
          if (!file || !api.ui.shellMedia) return
          const check = api.ui.shellMedia.validateMediaFile(file, { kind })
          if (!check.ok) {
            api.ui.toast?.(kind === 'video' ? '视频文件超过 50MB 或类型不受支持' : kind === 'image' ? '图片文件超过 20MB 或类型不受支持' : '字体文件超过 10MB 或类型不受支持', { type: 'error' })
            input.value = ''
            return
          }
          try {
            const db = await ensureMediaDb()
            await api.ui.shellMedia.writeMedia({ db, kind, key: mediaOriginKey(kind), value: file })
            api.saveConfig({
              [configKey]: mediaOriginKey(kind),
              ...(enabledKey ? { [enabledKey]: true } : {}),
              ...(kind === 'video' ? { backgroundVideoUrl: '', backgroundImageUrl: '', backgroundImageLocalKey: '' } : {}),
              ...(kind === 'image' ? { backgroundVideoEnabled: false, backgroundVideoUrl: '', backgroundVideoLocalKey: '' } : {}),
            })
            cfg = api.config()
            applyAll()
            api.ui.toast?.('本地资源已保存', { type: 'success' })
          } catch {
            api.ui.toast?.('本地资源保存失败', { type: 'error' })
          } finally {
            input.value = ''
          }
        })
        label.append(title, input)
        section.append(label)
      }

      appendFile('video', '选择本地视频', 'video/*', 'backgroundVideoLocalKey', 'backgroundVideoEnabled')
      appendFile('image', '选择静态图片', 'image/*', 'backgroundImageLocalKey')
      appendFile('font', '选择本地字体', '.woff2,.woff,.ttf,.otf,font/*', 'fontLocalKey')

      const actions = document.createElement('div')
      actions.className = 'lsb-actions'
      const arrange = document.createElement('button')
      arrange.type = 'button'
      arrange.className = 'lsb-btn'
      arrange.textContent = '一键整理窗口'
      arrange.addEventListener('click', () => api.ui.shellWindowArrange?.())
      const reset = document.createElement('button')
      reset.type = 'button'
      reset.className = 'lsb-btn'
      reset.textContent = '恢复默认布局'
      reset.addEventListener('click', () => api.ui.shellWindowReset?.())
      actions.append(arrange, reset)
      section.append(actions)
      host.append(section)
    }

    api.ui.configTab({ name: '界面精修', order: 80, render: renderSkinSettings })

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
      const previousMode = effectiveUiMode()
      const previousShell = cfg.shell
      const scrollPosition = { x: currentScrollX(), y: currentScrollY() }
      cfg = api.config()
      if (effectiveUiMode() !== previousMode || cfg.shell !== previousShell) pendingUiModeScroll = scrollPosition
      readCanvasState()
      invalidateTools()
      applyAll()
      syncGmMenu()
    })
    api.on('route:changed', () => {
      scheduleRefresh(true)
    })
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
      '.dark-mode-control, [data-themes-mode-toggle], a.color-scheme-top-link, a.search-page-link, form.search-form, form.meilisearch-search-top-form, form[role="search"][aria-label="站内搜索"], .sidebar-card.user-card',
      () => {
        if (!cfg.shell) return
        adoptSearch(shellSearchHost())
        adoptThemeToggle(document.querySelector('[data-lsb-shell-theme]'))
        adoptUserCard(document.querySelector('[data-lsb-shell-me]'))
        if (mountedUiMode === 'ios27') {
          const outlet = findRouteOutlet()
          canvasMountProfile(outlet)
          const site = canvasSurface('site-card')
          if (canvasActiveSheet === 'site-card' || site?.dataset.surfaceMode === 'rail') canvasSyncSiteSidebar(site)
        }
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
      canvas: canvasDebugSnapshot(),
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
        windows: shellWindowRegistry.map((item) => {
          const host = shellHost(item.id)
          const rect = host?.getBoundingClientRect?.()
          const body = host?.querySelector?.('[data-lsb-shell-window-body]')
          return {
            id: item.id,
            visible: !host?.hidden,
            rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
            scrollTop: Number(body?.scrollTop || 0),
          }
        }),
        layoutKey: shellWindowLayout ? shellLayoutApi.layoutStorageKey(location.origin, shellLayoutApi.widthBucket(shellViewport(shellWorkspace()).width)) : '',
        scrollBridge: !!scrollBridge,
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
    version: '1.2.21',
    description: '新帖/新回复免刷新送达：视口锚点无感插入 + 打字免打扰 + 新动态高亮并同步评论数',
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

    function captureContext() {
      return {
        gen: navGen,
        mode,
        ul: ctx.ul || null,
        tid: mode === 'topic' ? Number(ctx.tid) || 0 : 0,
      }
    }

    function currentListUl() {
      const selector = api.sel?.listUl || 'ul.post-list'
      const outlets = document.querySelectorAll('#lsb-shell-window-content main.wrap, .lsb-canvas-content-root, .main-panel')
      for (const outlet of outlets) {
        for (const ul of outlet.querySelectorAll(selector)) {
          // 帖子楼层也带 post-list 类，且可能留在隐藏的旧出口或缓存 DOM 中。
          // 只接受当前路由出口中真正的列表容器，避免把帖子正文识别成首页实时流列表。
          if (ul.classList.contains('topic-post-list')) continue
          if ([...ul.children].some((child) => child.classList.contains('post-entry'))) continue
          return ul
        }
      }
      return null
    }

    function currentTopicUl() {
      return document.querySelector(api.sel?.topicUl || 'ul.topic-post-list, ul.post-list')
    }

    function currentRoutePage() {
      try {
        return api.parse.detectPage(location)
      } catch {
        return api.page || {}
      }
    }

    function contextActive(token) {
      if (!token || token.gen !== navGen || token.mode !== mode) return false
      if (!(token.ul?.nodeType === 1) || !token.ul.isConnected || ctx.ul !== token.ul) return false
      const page = currentRoutePage()
      if (token.mode === 'topic') {
        return page.type === 'topic'
          && Number(page.id) === token.tid
          && api.page?.type === 'topic'
          && Number(api.page.id) === token.tid
          && Number(ctx.tid) === token.tid
          && currentTopicUl() === token.ul
      }
      if (token.mode !== 'list') return false
      const pageType = page.type
      const listPage = pageType === 'home'
        || pageType === 'forum'
        || pageType === 'featured'
        || pageType === 'footprint'
        || isUserTopicList(page)
      return listPage && currentListUl() === token.ul
    }

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

    function isUserTopicList(page = api.page) {
      if (page?.type !== 'user') return false
      const tab = page.tab || 'topics'
      return tab === 'topics' || tab === 'replies'
    }

    function shouldPoll() {
      return election.isLeader || isUserTopicList()
    }

    function isTopicListPage() {
      const t = api.page?.type
      if (t === 'home' || t === 'forum' || t === 'featured' || t === 'hot_discussions' || t === 'footprint') return true
      return isUserTopicList()
    }

    function captureList() {
      const ul = currentListUl()
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
      if (api.page.type === 'topic' && cfg.trackTopicReplies) {
        if (!captureTopic()) mode = null
        return
      }
      if (!isTopicListPage()) {
        mode = null
        return
      }
      if (!captureList()) mode = null
    }

    function teardown() {
      clearBumps()
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

    function showBanner(text, onClick, { asTopic = false, quiet = false, token = null } = {}) {
      if (token && !contextActive(token)) return false
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
    function numericMetaSpans(root) {
      return [...(root?.querySelectorAll?.('.post-meta span') || [])]
        .filter((el) => /^\d[\d,]*$/.test(el.textContent.trim()))
    }

    /** 只更新评论数的文字节点，保留站点放在同一 span 里的图标和其它标记。 */
    function syncReplyCount(row, src, replies) {
      if (replies == null) return
      const target = numericMetaSpans(row).at(-1)
      if (!target) return
      const source = numericMetaSpans(src).at(-1)
      const display = source?.textContent.trim() || String(replies)
      const walker = document.createTreeWalker(target, 4)
      const textNodes = []
      let node
      while ((node = walker.nextNode())) textNodes.push(node)
      if (textNodes.length) {
        textNodes.forEach((textNode, i) => {
          textNode.nodeValue = i === textNodes.length - 1 ? display : ''
        })
      } else {
        target.appendChild(document.createTextNode(display))
      }
    }

    function notifyListRowUpdated(id) {
      try {
        api.emitGlobal('live-feed:list-row-updated', { id })
      } catch {
        /* 已读插件缺席不得影响实时流 */
      }
    }

    function attachNativeUnread(row, src) {
      const from = src?.querySelector?.('a.unread-topic-notice')
      if (!row || !from || row.querySelector('a.unread-topic-notice')) return
      const node = document.importNode(from, true)
      const title = row.querySelector('a.post-title:not(.post-author)')
      if (title) title.after(node)
      else row.querySelector('.post-title-row')?.appendChild(node)
    }
    function markBumped(items, token = captureContext()) {
      if (!contextActive(token)) return
      lastBumped = items.length
      if (!items.length || !ctx.ul) return
      for (const it of items) {
        const row = ctx.ul.querySelector(`:scope > li.post-item a.post-title[href*="/topic/${it.id}"]`)
          ?.closest('li.post-item')
        if (!row) continue
        // 轮询返回的是同一帖的最新行：同步评论数，不能只复制未读点和高亮。
        syncReplyCount(row, it.el, it.replies)
        // 站点刷新会在标题旁留「未读」红点；高亮只闪 2.6 秒，点要一直留到用户进帖。
        attachNativeUnread(row, it.el)
        if (cfg.highlightBumped) {
          row.classList.remove('lsb-live-bumped')
          void row.offsetWidth
          row.classList.add('lsb-live-bumped')
          const tid = setTimeout(() => row.classList.remove('lsb-live-bumped'), 2600)
          bumpTimers.push(tid)
        }
        // 已读插件在这里重新检查水位，避免软跳缓存里的旧提示被重新挂回。
        notifyListRowUpdated(it.id)
      }
    }

    function clearBumps() {
      for (const t of bumpTimers.splice(0)) clearTimeout(t)
      document.querySelectorAll('li.post-item.lsb-live-bumped').forEach((row) => row.classList.remove('lsb-live-bumped'))
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
      const token = captureContext()
      const seen = ctx.seen
      if (!contextActive(token) || !seen) return 0
      const doc = await liveDoc(listUrl())
      if (!contextActive(token) || ctx.seen !== seen) return 0
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
      markBumped(bumped, token)

      if (!pending.length) {
        if (!bumped.length) hideBanner()
        return 0
      }
      if (!contextActive(token)) return 0
      announceNew('帖', pending.length)
      ctx.maxId = Math.max(ctx.maxId, ...pending.map((x) => x.id))
      ctx.maxTs = Math.max(ctx.maxTs, ...pending.map((x) => x.lastActiveTs || 0))
      const n = pending.length
      if (!contextActive(token)) return 0
      await flushOrOffer(token)
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

    async function flushOrOffer(token) {
      if (!contextActive(token) || !pending.length) return
      if (canFlushNow()) {
        const away = !nearTop()
        const n = insertPending(true, token)
        // 在视口外静默插入后仍然告知一声，并给一键回顶——内容不过期，用户也不失去感知。
        // （逛吧只是静默插入，用户不知道上面多了东西）
        if (n && contextActive(token) && away) {
          showBanner(`▲ 已加载 ${n} 条新帖 — 点击回到顶部`, () => {
            if (!contextActive(token)) return
            hideBanner()
            window.scrollTo?.({ top: 0, behavior: 'smooth' })
          }, { quiet: true, token })
        }
        return
      }
      const m = await msgDelta()
      if (!contextActive(token) || !pending.length) return
      const why = isTyping() ? '（写完自动加载）' : ''
      showBanner(
        `▲ ${pending.length} 条新帖${m ? ` · ${m} 条新消息` : ''} — 点击加载${why}`,
        () => insertPending(false, token),
        { token },
      )
    }

    function insertPending(silent = false, token = captureContext()) {
      if (!contextActive(token) || !pending.length) return 0
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
      if (pending.length) showBanner(
        `▲ 还有 ${pending.length} 条新帖 — 继续加载`,
        () => insertPending(false, token),
        { token },
      )
      return batch.length
    }

    /* ── 轮询：帖子模式 ── */
    async function cycleTopic() {
      const token = captureContext()
      const tid = token.tid
      if (!contextActive(token) || !tid) return 0
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
      if (!contextActive(token)) return 0
      absorb(t)
      // 回复把帖子顶到了新页：本轮立即追补，不必等下一个周期。
      // 否则每次翻页都会让新页的首批回复延迟一整个轮询间隔才出现。
      for (let i = 0; i < MAX_PAGE_CATCHUP && t.pages > ctx.pages; i++) {
        ctx.pages = t.pages
        t = api.parse.topic(await liveDoc(api.routes.topic(tid, ctx.pages)))
        if (!contextActive(token)) return 0
        absorb(t)
      }
      if (t.pages > ctx.pages) ctx.pages = t.pages

      if (!contextActive(token) || !fresh.size) return 0
      pending = [...fresh.values()].sort((a, b) => a.floor - b.floor)
      if (!contextActive(token)) return 0
      const n = pending.length
      announceNew('回复', n)
      if (cfg.autoInsert && !isTyping() && document.visibilityState !== 'hidden') {
        insertFloors(true, token)
        return n
      }
      const m = await msgDelta()
      if (!contextActive(token) || !pending.length) return 0
      const why = isTyping() ? '（写完自动加载）' : ''
      showBanner(
        `↓ ${n} 条新回复${m ? ` · ${m} 条新消息` : ''} — 点击加载${why}`,
        () => insertFloors(false, token),
        { asTopic: true, token },
      )
      return n
    }

    function insertFloors(silent = false, token = captureContext()) {
      if (!contextActive(token) || !pending.length) return 0
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
      const token = captureContext()
      if (!contextActive(token) || !pending.length) return false
      if (token.mode === 'topic') {
        if (!cfg.autoInsert || isTyping() || document.visibilityState === 'hidden') return false
        return insertFloors(true, token) > 0
      }
      if (!canFlushNow()) return false
      return insertPending(true, token) > 0
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
      teardown()
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('visibilitychange', onVisible)
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
      const token = captureContext()
      void (async () => {
        const wait = inflight
        if (wait) await wait
        if (!contextActive(token)) return
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
      load: () => {
        const token = captureContext()
        return token.mode === 'topic' ? insertFloors(false, token) : insertPending(false, token)
      },
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
    version: '2.0.36',
    description: '全家桶总览：各模块状态卡片、快捷开关、跨模块关键指标',
    author: 'you',
    requires: { base: '^2.4.1' },
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
