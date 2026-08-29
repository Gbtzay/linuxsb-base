# 摘 RC 进正式版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 氢/氧摘掉（RC）标，版本 0.1.36 / 1.0.104，文档改成正式版；LTS 仍冻新功能。

**Architecture:** 油猴头在 `build.mjs` / `build-suite.mjs`；面板标题在 `src/core.js` 与 `src/ui.js`；氧/LTS 号在 `SUITE_VERSION` 与套件中心。`test/suite.test.js` 读 `dist/`，所以改源之后必须重建三个产物。用户文档就地改、文件名不动。

**Tech Stack:** Node ESM 构建、`node:test` + jsdom、现有三个 dist 油猴产物。

## Global Constraints

- 氢不抬到 `1.0.0`；`LSB.version` 仍是氢 `VERSION`；本次氢 `0.1.35` → `0.1.36`
- 氧与 LTS `@version` 都是 `1.0.104`；LTS 号仍从氧产物读取
- 不要水/H₂O；不要给名称加（GA）；不要 `@updateURL`；不要改 Greasy Fork slug / 592914 / 592915 / 593319
- 氢名 `LINUX.SB 氢` / `LINUX.SB Hydrogen`；氧名 `LINUX.SB 氧` / `LINUX.SB Oxygen`；面板 `LINUX.SB · 氢`；LTS 名与冻新功能简介一字不改
- 插件 `@version` / `manifest.version` 不顺手加
- 插件与构建脚本 UTF-8 无 BOM、LF；Windows 终端不要用 `&&`（`package.json` 里 `npm run build` 的 `&&` 可以留）
- 不要 git commit、不要打 tag、不要代传 Greasy Fork，除非用户在对话里明确要求
- `docs/superpowers/specs/` 与 `plans/` 里的历史 RC 字样不改

---

### Task 1: 正式版名称与版本的失败测试

**Files:**
- Modify: `test/suite.test.js`
- Modify: `test/core.test.js`
- Test: `test/suite.test.js`、`test/core.test.js`

**Interfaces:**
- Consumes: 现有 `dist/linuxsb-base.user.js` / `linuxsb-suite.user.js` / `linuxsb-lts.user.js`（仍带 RC）；`src/core.js` `VERSION` 仍是 `0.1.35`；`core.ui.title` 仍是 `LINUX.SB · 氢（RC）`
- Produces: 两条会失败的断言契约——产物头无 RC、氢号 0.1.36、面板标题无 RC、LTS 简介仍含冻新功能

- [ ] **Step 1: Write the failing tests**

把 `test/suite.test.js` 里整段 `test('Greasy Fork：氢/氧对外名称与简介标明 RC', …)` 换成：

```javascript
test('Greasy Fork：氢/氧对外名称与简介不带 RC', () => {
  assert.match(baseCode, /@name\s+LINUX\.SB 氢$/)
  assert.match(suiteCode, /@name\s+LINUX\.SB 氧$/)
  assert.match(baseCode, /@name:en\s+LINUX\.SB Hydrogen$/)
  assert.match(suiteCode, /@name:en\s+LINUX\.SB Oxygen$/)
  assert.match(baseCode, /@version\s+0\.1\.36/)
  assert.match(suiteCode, /@version\s+1\.0\.104/)
  assert.match(baseCode, /@description\s+linux\.sb 脚本基座/)
  assert.match(suiteCode, /@description\s+linux\.sb 功能套件/)
  assert.doesNotMatch(baseCode, /【RC】/)
  assert.doesNotMatch(suiteCode, /【RC】/)
  assert.doesNotMatch(baseCode, /@description:en\s+\[RC\]/)
  assert.doesNotMatch(suiteCode, /@description:en\s+\[RC\]/)
  assert.doesNotMatch(baseCode, /氢（RC）/)
  assert.doesNotMatch(suiteCode, /氧（RC）/)
  assert.doesNotMatch(baseCode, /Hydrogen \(RC\)/)
  assert.doesNotMatch(suiteCode, /Oxygen \(RC\)/)
  assert.doesNotMatch(baseCode, /（Beta）/)
  assert.doesNotMatch(suiteCode, /@name\s+LINUX\.SB 氧（Beta）/)
})
```

注意：`@name` 用 `$` 锚在行尾，避免再匹配到 `氢（RC）`。

在同一文件的 LTS 用例 `Greasy Fork：LTS 产物一段头…` 的 `assert.match(ltsCode, /@name:en\s+LINUX\.SB \(LTS\)/)` 后面追加：

```javascript
  assert.match(ltsCode, /@version\s+1\.0\.104/)
  assert.match(ltsCode, /冻新功能/)
  assert.doesNotMatch(ltsCode, /氢（RC）/)
  assert.doesNotMatch(ltsCode, /【RC】/)
```

在 `test/core.test.js` 的 `test('启动后 snapshot / csrf / 面板就绪'` 之后插入：

```javascript
test('正式版氢号是 0.1.36，面板标题不带 RC', () => {
  assert.equal(VERSION, '0.1.36')
  const core = boot()
  assert.equal(core.ui.title, 'LINUX.SB · 氢')
  assert.doesNotMatch(core.ui.title, /RC/)
  core.ui.openPanel()
  assert.match(document.querySelector('.lsb-panel-head').textContent, /LINUX\.SB · 氢/)
  assert.doesNotMatch(document.querySelector('.lsb-panel-head').textContent, /RC/)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run（PowerShell，不要用 `&&`）：

```
node --test --test-force-exit --test-name-pattern "不带 RC|正式版氢号|LTS 产物一段头" test/suite.test.js test/core.test.js
```

Expected: FAIL。`suite.test.js` 因 dist 仍是 `氢（RC）` / `0.1.35` / `1.0.103`；`core.test.js` 因 `VERSION` 仍是 `0.1.35`、标题仍是 `LINUX.SB · 氢（RC）`。不得在本任务改生产代码或重建 dist。

- [ ] **Step 3: Do not commit**

用户未要求提交。不要 `git add` / `git commit`。

---

### Task 2: 摘牌、改号、重建产物

**Files:**
- Modify: `build.mjs`（油猴头）
- Modify: `build-suite.mjs`（`SUITE_VERSION` 与油猴头）
- Modify: `src/core.js`（`VERSION` 与面板 title）
- Modify: `src/ui.js`（默认 title）
- Modify: `package.json`（`version`）
- Modify: `suite/suite-center.js`（`manifest.version`）
- Modify: `dist/linuxsb-base.user.js`、`dist/linuxsb-suite.user.js`、`dist/linuxsb-lts.user.js`（只通过构建脚本写出）
- Test: `test/suite.test.js`、`test/core.test.js`

**Interfaces:**
- Consumes: Task 1 的失败断言
- Produces: 氢头/氧头/面板标题为正式版字符串；氢 `0.1.36`；氧与 LTS `1.0.104`；`build-lts.mjs` 的 LTS 名称与冻新功能简介不改

- [ ] **Step 1: Change source strings and versions**

`src/core.js`：

```javascript
export const VERSION = '0.1.36'
```

同一文件面板构造改为：

```javascript
    this.ui = new UI({
      title: isLtsChannel() ? 'LINUX.SB · LTS' : 'LINUX.SB · 氢',
      version: isLtsChannel() ? ltsDisplayVersion() || VERSION : VERSION,
    })
```

`src/ui.js`：

```javascript
  constructor({ title = 'LINUX.SB · 氢', version = '' } = {}) {
```

`package.json`：

```json
  "version": "0.1.36",
```

`build-suite.mjs`：

```javascript
const SUITE_VERSION = '1.0.104'
```

`suite/suite-center.js`：

```javascript
    version: '1.0.104',
```

`build.mjs` 的 `banner` 头四行名称/简介换成（其余 `@grant` / `@connect` / `@run-at` 一行不改）：

```javascript
const banner = `// ==UserScript==
// @name         LINUX.SB 氢
// @name:en      LINUX.SB Hydrogen
// @namespace    https://linux.sb/
// @version      ${version}
// @description  linux.sb 脚本基座：站点解析、统一网络请求、设置面板与插件挂载。请与「LINUX.SB 氧」一起使用。
// @description:en  Userscript base for linux.sb: site parsing, networked requests, settings panel, plugin host. Install LINUX.SB Oxygen for features.
```

`build-suite.mjs` 的 `banner` 开头换成（后面的 `@author` / `@license` / `@match` 等原样）：

```javascript
const banner = `// ==UserScript==
// @name         LINUX.SB 氧
// @name:en      LINUX.SB Oxygen
// @namespace    https://linux.sb/
// @version      ${SUITE_VERSION}
// @description  linux.sb 功能套件：氢壳、实时流、未读哨兵、AI 总结、签到日历等 ${mods.length} 个模块。必须先安装「LINUX.SB 氢」。
// @description:en  Feature pack for linux.sb (shell, live feed, unread sentinel, AI summary, check-in, and more). Requires LINUX.SB Hydrogen.
```

不要改 `build-lts.mjs` 的 `description` / `descriptionEn` / `COLLISION` / `rewriteBaseHeader` 目标名。LTS 头仍从氢头改写成 `LINUX.SB（LTS）`，简介仍是「冻新功能，只修阻断」。

不要改任何 `plugins/*.user.js` 的版本号。

- [ ] **Step 2: Rebuild all three dist files**

Run：

```
node build.mjs
node build-suite.mjs
node build-lts.mjs
```

Expected：控制台分别打印氢 `v0.1.36`、氧 `v1.0.104`、LTS `v1.0.104`。

- [ ] **Step 3: Run Task 1 tests to verify they pass**

Run：

```
node --test --test-force-exit --test-name-pattern "不带 RC|正式版氢号|LTS 产物一段头" test/suite.test.js test/core.test.js
```

Expected: PASS（含原有 LTS 撞车文案与 grant 断言）。若 `@name` 行尾有空格导致 `$` 锚失败，把断言改成 `/@name\s+LINUX\.SB 氢\s*$/`，不要把（RC）加回去。

- [ ] **Step 4: Do not commit**

不要 `git add` / `git commit`。

---

### Task 3: 规范与用户文档就地改写

**Files:**
- Modify: `docs/CONVENTIONS.md`（§2.2）
- Modify: `README.md`（方式 A 安装段）
- Modify: `docs/测试招募-氢氧-beta.md`
- Modify: `docs/功能征集-rc-ga.md`
- Modify: `docs/已知问题-rc.md`

**Interfaces:**
- Consumes: Task 2 的正式版名称与 0.1.36 / 1.0.104
- Produces: 五份文档不再声称「不是正式版」或「不摘 RC」；LTS 仍写冻新功能；文件名全部不动

- [ ] **Step 1: Replace CONVENTIONS §2.2**

把 `docs/CONVENTIONS.md` 从 `## 2.2 RC 冻结（当前）` 到「已知问题见」那一段（不含 `## 3. 已知约束`）整段换成：

```markdown
## 2.2 正式版（当前）

氢 **0.1.36** / 氧 **1.0.104** / LTS **1.0.104**。开发线已摘 RC，可再往 `ORDER` 加模块。不得改对外产品名隐喻（H₂O 等）。氢不抬到 `1.0.0`。

- 油猴显示名为「氢」「氧」。Greasy Fork 列表 URL 仍可能带 `-beta` slug，以脚本头 `@version` 与油猴里的名为准。
- 必须出包时：改了 `src/` 则氢补丁号 +1；改了套件或模块则氧补丁号 +1，LTS `@version` 与当时氧号对齐。

LTS 是另一条线，产物 `dist/linuxsb-lts.user.js`，油猴名 **LINUX.SB（LTS）**。一份脚本含基座与精简功能包（`ORDER_LTS`：楼层统计、断点续读、已读、首页回位、主楼预览、未读哨兵、签到日历、积分、配置迁移、年度报告、氢壳、实时流）。装 LTS 前必须先卸掉氢和氧。商店页：https://greasyfork.org/zh-CN/scripts/593319-linux-sb-lts 。LTS 仍冻新功能，只修装不上、页面花、请求打爆、数据丢。

已知问题见 [`docs/已知问题-rc.md`](已知问题-rc.md)。
```

- [ ] **Step 2: Replace README 方式 A 段**

`README.md` 里「方式 A」两段换成：

```markdown
安装 `dist/linuxsb-base.user.js`（氢 · 基座）+ `dist/linuxsb-suite.user.js`（氧 · 重型套件，内含
19 个模块）。套件额外提供「套件总览」仪表盘：模块状态卡片、快捷启停、跨模块关键指标聚合。每个模块仍是独立注册的插件——可单独停用、各自配置页保留。

只要一份脚本、精简功能：装 LINUX.SB（LTS）https://greasyfork.org/zh-CN/scripts/593319-linux-sb-lts 。与氢+氧二选一；请先卸掉氢和氧。LTS 冻新功能，只修站点断裂。
```

不要改 README 里的测试用例计数，除非 Task 4 全量测试的总数变了（本次只改已有用例名，不新增文件级套件，`core.test.js` 多 1 条：406 → 407）。若你在本任务改 README 计数，写成 407；否则留给 Task 4。

- [ ] **Step 3: Rewrite the three user docs in place**

`docs/测试招募-氢氧-beta.md` 全文换成：

```markdown
# LINUX.SB 氢 / 氧

这是一套给 linux.sb 用的 Tampermonkey 脚本，现在是正式版。基座叫 **氢**，功能包叫 **氧**。两个都要装，**先氢后氧**。不是站点官方出品，数据只存在你自己浏览器里。

装之前建议先在氢面板里用「配置迁移」导出一份备份（第一次装可以忽略）。

## 版本

| | 油猴名 | 版本 |
|---|---|---|
| 氢 | LINUX.SB 氢 | **0.1.36** |
| 氧 | LINUX.SB 氧 | **1.0.104** |
| LTS | LINUX.SB（LTS） | **1.0.104** |

对不上就刷新 Greasy Fork 再装一次。氧也要一起换（先氢后氧）。

**氢+氧** 和 **LTS** 二选一，不要同时开。开发线继续装氢再装氧。只要日常浏览、不想跟新功能，装 LTS：https://greasyfork.org/zh-CN/scripts/593319-linux-sb-lts （油猴名 LINUX.SB（LTS））。请先关掉或卸掉「LINUX.SB 氢」和「LINUX.SB 氧」，只留 LTS。LTS 不含称号行情、机会监控、AI 总结、个人存档、高频标记、性能探针、悬停画像。LTS 冻新功能，只修装不上、页面花、请求打爆、数据丢。

## 安装

1. 浏览器装 [Tampermonkey](https://www.tampermonkey.net/)
2. 安装氢：https://greasyfork.org/zh-CN/scripts/592914-linux-sb-%E6%B0%A2-beta
3. 安装氧：https://greasyfork.org/zh-CN/scripts/592915-linux-sb-%E6%B0%A7-beta
4. 打开 linux.sb，右下角出现 **H**，氢面板「插件」里能看到一串模块，就算装上了

LTS 与上面二选一：不要同时开氢/氧和 LINUX.SB（LTS）。商店页：https://greasyfork.org/zh-CN/scripts/593319-linux-sb-lts

作者页：https://greasyfork.org/zh-CN/users/1637325-xb70sr71

GitHub Release：https://github.com/Gbtzay/linuxsb-base/releases/tag/v1.0.62

Greasy Fork 地址里可能还带 `-beta`，以油猴里的脚本名和版本号为准。

氢壳不喜欢可以关：油猴图标菜单，或氢面板「界面精修」。关了就回到原版界面，其它功能保留。

## 建议按这个顺序试

- 氢壳：顶栏、左栏、从帖子点回首页（个人卡上的按钮应是「发帖」不是「回帖」）；进帖子时左右栏应先有色块再填内容
- 列表：已读置灰、主楼预览、悬停用户画像、首页回位（点进帖再回来应滚到那条；回成功后再刷新应停在顶部，不要反复跳）
- 帖子：断点续读、实时流新回复
- 多开两个标签：未读哨兵只应由其中一个负责巡检；左栏「我的通知」红点应跟站点个人卡，后台不要自己打开通知页（点进自己的通知页后红点应立刻掉）。标题括号仍是首页新动态，不是通知数
- 签到日历、积分趋势、称号行情（开氢壳走左栏；关壳才有右下「行情」钮。图可拖高，悬停详情竖排。`/gacha_market` 折叠仍在；大盘在浮层或折叠里能看到指数和榜）
- AI 总结（可选）：在「AI 总结」页填自己的 API 端点和 Key。第一次请求外部域名时 TM 会问是否允许
- 配置迁移：导出后再说自己会不会重装

氧里没有「本地联动」，那是独立插件，这次不用管。

## 已知情况（不是你没装好）

见 [`已知问题-rc.md`](已知问题-rc.md)。摘要：

- AI Key 明文存在本机，**反馈里不要贴 Key**
- `@connect *` 是为了你自己填的模型地址
- 进帖子先出空壳色块再填内容，是有意的
- 称号行情：旧默认 1 分钟 / 30 分钟会改成 30 秒；自己改过的分钟间隔会换算成秒
- 请以 Greasy Fork / GitHub 上的版本号为准，不要混装旧文件

## 怎么反馈

回帖或私信。请带上：

- 氢、氧版本（面板或 Tampermonkey 里都能看到）
- 浏览器 + Tampermonkey 版本
- 哪一页、哪一步、期望是什么、实际是什么
- 能复现的话更好；氢面板「运行日志」可以一并带上

开发线可以提新功能。LTS 不收新模块。
```

`docs/功能征集-rc-ga.md` 全文换成：

```markdown
# LINUX.SB 氢 / 氧 / LTS

氢 **0.1.36**、氧 **1.0.104**、LTS **1.0.104**。开发线是正式版，可以提新功能。LTS 仍冻新功能，只修站点断裂。

不是站点官方出品。数据只在你自己浏览器里。

## 已经有的

不必再许愿一遍：

- 氢壳（可关）
- 已读置灰
- 首页回位
- 主楼预览
- 用户画像
- 断点续读
- 实时流
- 未读哨兵
- 机会监控
- 签到日历
- 积分趋势
- 称号行情（含分析大盘与全站浮层）
- AI 总结
- 个人存档
- 年度报告
- 配置迁移
- 检查更新
- LTS 合一包：https://greasyfork.org/zh-CN/scripts/593319-linux-sb-lts

氢壳不喜欢可以关：油猴图标菜单，或氢面板「界面精修」。关了就回到原版界面，其它功能保留。

## 这帖现在收什么

开发线（氢+氧）：功能许愿、使用坑、版本、哪一页、期望与实际、怎么复现。

LTS：只收装不上、页面花了、请求打爆、数据丢了。不收给 LTS 加新模块。

不收：改名水/H₂O、把氢抬到 1.0.0、帖内软跳、恢复墙纸。

已知问题：[`已知问题-rc.md`](已知问题-rc.md)

## 安装

**氢+氧** 和 **LTS** 二选一。

开发线，两个都要装，**先氢后氧**：

1. 浏览器装 [Tampermonkey](https://www.tampermonkey.net/)
2. 氢：https://greasyfork.org/zh-CN/scripts/592914-linux-sb-%E6%B0%A2-beta
3. 氧：https://greasyfork.org/zh-CN/scripts/592915-linux-sb-%E6%B0%A7-beta
4. 打开 linux.sb，右下角出现 **H**，氢面板「插件」里能看到一串模块，就算装上了

只要日常浏览：卸掉氢和氧，只装 LTS：https://greasyfork.org/zh-CN/scripts/593319-linux-sb-lts

作者页：https://greasyfork.org/zh-CN/users/1637325-xb70sr71

油猴名：「LINUX.SB 氢」「LINUX.SB 氧」「LINUX.SB（LTS）」。Greasy Fork 若落后，以油猴 / 面板里的版本为准。

源码：https://github.com/Gbtzay/linuxsb-base

装之前建议先在氢面板里用「配置迁移」导出一份备份（第一次装可以忽略）。

## 怎么反馈

回帖或私信。请带上版本（面板或 Tampermonkey）、浏览器、哪一页、期望与实际。能复现更好；氢面板「运行日志」可以一并带上。反馈里不要贴 API Key。
```

`docs/已知问题-rc.md` 全文换成：

```markdown
# 氢 0.1.36 / 氧 1.0.104 / LTS 1.0.104 · 已知问题与本轮不修

下面不是「没装好」。LTS 仍冻新功能。

## 已知行为

- **进帖色块占位**：宽屏进帖子时，顶栏和左右栏会先出同色块，版块/搜索/卡片稍后再填上。这是为了减少整页闪空，不是壳坏了。
- **通知红点**：左栏「我的通知」跟首页个人卡原生红点走，后台不会打开通知页（打开会被站点当成已读）。点进自己的通知页后立刻卸掉，不会把上次库存再画回去。刷新后先留着站点自己的红点；库存 0 时不会先把站点红点藏掉。首页「屏蔽设置」上的 `.notify-badge` 是关键词条数，不是通知未读。标题括号仍是消息箱，不含通知数。
- **墙纸 / 液态玻璃**：已撤。配置里若还留着旧墙纸 URL，也不会再铺。
- **称号行情**：图在 `/gacha_market` 折叠和全站浮层。开氢壳走左栏「称号行情」；关壳才在右下留「行情」钮。氧面板只留间隔设置，不再画 K。顶栏「称号中心」是 `/gacha` 抽取页，没有在售列表，不会出图。大盘是「大盘」视图，不是 `/gacha`。
- **AI 总结**：Key 明文存在本机。反馈里不要贴 Key。`@connect *` 是为了你填的模型地址。
- **楼层统计 / 高频发言标记**：示例模块打进全家桶，可在套件总览里关掉。
- **本地联动**：不进公开氧，公开测试不用装。

## 本轮不修

- 给 LTS 加新模块
- 把氢 / 氧改名叫水或 H₂O
- 把氢抬到 1.0.0（插件声明的是 `requires.base: '^0.1.0'`）
- 恢复墙纸 / 液态玻璃
- 帖子页改成软跳

## 怎么反馈

回帖或私信。请带上氢、氧版本（面板或油猴里）、浏览器、哪一页、期望与实际。
```

- [ ] **Step 4: Sanity-check the five docs**

Run：

```
node -e "const fs=require('fs'); const files=['docs/CONVENTIONS.md','README.md','docs/测试招募-氢氧-beta.md','docs/功能征集-rc-ga.md','docs/已知问题-rc.md']; for (const f of files) { const t=fs.readFileSync(f,'utf8'); if (/不摘 RC|不是正式版|氢（RC）|【RC】冻本/.test(t)) { console.error('still RC:', f); process.exitCode=1 } if (!/0\.1\.36/.test(t) && f!=='README.md') { console.error('missing 0.1.36:', f); process.exitCode=1 } } if (!process.exitCode) console.log('docs ok')"
```

Expected: `docs ok`。`README.md` 可以不写 `0.1.36`（它历来不钉死商店号）。五份里都不得再出现「不摘 RC」「不是正式版」「氢（RC）」。

- [ ] **Step 5: Do not commit**

不要 `git add` / `git commit`。

---

### Task 4: 全量测试与商店粘贴稿

**Files:**
- Modify: `README.md`（仅当测试总数从 406 变成 407 时改那一行）
- Test: 全仓库 `npm test`

**Interfaces:**
- Consumes: Task 1–3 的源、dist、文档
- Produces: 全绿测试；给用户的氢/氧/LTS 粘贴稿（写在对话里，不要新建 changelog 文件）

- [ ] **Step 1: Run the full suite**

Run：

```
npm test
```

Expected: 全绿。Task 1 在 `core.test.js` 新增 1 条，总数应为 **407**（若实际不是 407，以跑出来的 `ℹ tests N` 为准，并改 `README.md` 里 `npm test` 那一行的数字）。

- [ ] **Step 2: Confirm dist headers**

Run：

```
node -e "const fs=require('fs'); for (const f of ['dist/linuxsb-base.user.js','dist/linuxsb-suite.user.js','dist/linuxsb-lts.user.js']) { const t=fs.readFileSync(f,'utf8').split('\n').slice(0,10).join('\n'); console.log('----',f); console.log(t); console.log() }"
```

Expected：氢 `@name LINUX.SB 氢` `@version 0.1.36`；氧 `@name LINUX.SB 氧` `@version 1.0.104`；LTS `@name LINUX.SB（LTS）` `@version 1.0.104` 且简介含「冻新功能」。

- [ ] **Step 3: Paste store copy in the user-facing reply**

对话里原样给出下面三段（不要写进仓库新文件）：

氢（592914）：

```
名称：LINUX.SB 氢
简介：linux.sb 脚本基座：站点解析、统一网络请求、设置面板与插件挂载。请与「LINUX.SB 氧」一起使用。
版本：0.1.36
changelog：正式版。去掉（RC）。请与氧一起更新。
```

氧（592915）：

```
名称：LINUX.SB 氧
简介：linux.sb 功能套件：氢壳、实时流、未读哨兵、AI 总结、签到日历等 19 个模块。必须先安装「LINUX.SB 氢」。
版本：1.0.104
changelog：正式版。去掉（RC）。含 RC 期间未上架修复（称号行情不再刷死、整页交易页 popstate 不再误 reload、LTS 刷新后左栏个人卡晚出现仍迁入）。请先更新氢。
```

LTS（593319）：

```
名称：LINUX.SB（LTS）
简介：【LTS】一份脚本含基座与精简功能包。请先卸掉「LINUX.SB 氢」和「LINUX.SB 氧」。冻新功能，只修阻断。
版本：1.0.104
changelog：与氧 1.0.104 对齐。仍冻新功能。含个人卡晚出现仍迁入左栏等阻断修复。请先卸掉氢和氧再装。
```

不要 `gh release`、不要打开 Greasy Fork 代发、不要 `git tag`。

- [ ] **Step 4: Do not commit**

不要 `git add` / `git commit`。

---

## Self-review

1. Spec coverage: 名称/简介 → Task 2；版本 → Task 2；测试契约 → Task 1；LTS 冻新功能断言 → Task 1/2；文档五处 → Task 3；全量测试与粘贴稿 → Task 4；非目标（1.0.0、H₂O、slug、updateURL、代上架、tag、改 ORDER_LTS）写在 Global Constraints，无对应改动任务。
2. Placeholders: 无 TBD；文档与 banner 均为完整字符串。
3. Types: 版本字符串 `0.1.36` / `1.0.104` 在测试、源、文档、粘贴稿一致。
