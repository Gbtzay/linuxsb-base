# 称号行情 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 氧模块「称号行情」：采集 `/gacha_market` 挂单高低价与中位数，画全场四锚点趋势和各称号双折线；面板与交易页共用。

**Architecture:** 新插件 `title-quotes` 自带选择器与纯函数（parse / fold / anchors / pushSnap），经 `title-quotes:debug` 给测试调用。巡检走 `api.election` + `api.net.doc`。氢不动。

**Tech Stack:** userscript 插件、JSDOM `node:test`、基座 `api.store` / `api.ui.tab` / `api.net.doc`。

## Global Constraints

- 插件 id `title-quotes`，文件名相同，`@version` = `manifest.version` = `1.0.0`
- 皮肤 `1.1.30`；套件 `1.0.49`；不改基座
- UTF-8 无 BOM、LF；不提交 `/gacha_market_buy`
- 类名只用 `lsb-title-quotes*`
- ORDER 紧接 `points-ledger` 之后

## Files

- Create: `plugins/title-quotes.user.js`
- Create: `test/title-quotes.test.js`
- Modify: `suite/order.js`（`points-ledger` 后插入）
- Modify: `plugins/skin.user.js`（`collectTools` + 版本）
- Modify: `test/skin.test.js`（工具列表）
- Modify: `build-suite.mjs` / `suite/suite-center.js` 版本 `1.0.49`
- Modify: `README.md` 插件表

---

### Task 1: 解析 / 中位数 / 锚点 / 同值合并（先红后绿）

**Files:** `test/title-quotes.test.js`, `plugins/title-quotes.user.js`

**Produces:** `debug.parseCards`, `mergeListings`, `foldTitles`, `median`, `pickAnchors`, `pushSnap`, `series`, `reset`

- [ ] 写失败测试（夹具卡片 HTML，经 debug RPC）
- [ ] 最小实现纯函数 + debug 挂出
- [ ] 测试通过

### Task 2: 面板空状态 / 一次快照 / 两次出线；交易页插入节

**Files:** 同上

- [ ] 零快照空文案；一次快照有锚点无折线；两次以上 `.lsb-svg`
- [ ] `/gacha_market` 夹具出现 `.lsb-title-quotes-embed`；fetch 记录不含 `gacha_market_buy`
- [ ] `render` + `mountEmbed` + `api.ui.tab`

### Task 3: 登记与入口

**Files:** `suite/order.js`, `plugins/skin.user.js`, `test/skin.test.js`, `README.md`, `build-suite.mjs`, `suite/suite-center.js`

- [ ] ORDER、皮肤工具「称号行情」、皮肤测试期望数组、README、氧 1.0.49
- [ ] `node build-suite.mjs` 后全量测试
