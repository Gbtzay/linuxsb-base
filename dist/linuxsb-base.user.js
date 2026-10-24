// ==UserScript==
// @name         LINUX.SB 氢
// @name:en      LINUX.SB Hydrogen
// @namespace    https://linux.sb/
// @version      2.4.1
// @description  linux.sb 脚本基座：站点解析、统一网络请求、设置面板与插件挂载。请与「LINUX.SB 氧」一起使用。
// @description:en  Userscript base for linux.sb: site parsing, networked requests, settings panel, plugin host. Install LINUX.SB Oxygen for features.
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
