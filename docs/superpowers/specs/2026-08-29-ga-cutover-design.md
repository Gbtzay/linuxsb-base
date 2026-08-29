# 摘 RC 进正式版（GA）

日期：2026-08-29  
范围：氢/氧对外名称与简介摘掉（RC）；面板标题同步；版本氢 0.1.36 / 氧与 LTS 1.0.104；规范与三份用户文档就地改写；套件测试从「标明 RC」改为「不得带 RC」。  
非目标：氢抬到 `1.0.0`、改名水/H₂O、改 Greasy Fork slug 或脚本号、加 `@updateURL`、自动上架、打 git tag、改 LTS 收录、解冻 LTS、给名称加（GA）。

## 问题

RC 冻本已收口。开发线要毕业成正式版：油猴和面板不再写（RC），氢+氧恢复可加功能。LTS 仍是稳定子集，名称与冻新功能政策不动。这是单独一次发版，不是再给 RC 补丁。

## 政策

| | 商店 | 产物 | 政策 |
|---|---|---|---|
| 开发 | 592914 氢 + 592915 氧 | `linuxsb-base.user.js` + `linuxsb-suite.user.js`（`ORDER` 全家桶） | 正式版；可再往 `ORDER` 加模块 |
| LTS | 593319 | `linuxsb-lts.user.js`（`ORDER_LTS`） | 仍冻新功能；只修装不上、页面花、请求打爆、数据丢 |

氢+氧与 LTS 仍二选一。检查更新脚本号与安装 URL 不动（氢/氧地址里可以继续带 `-beta`，以油猴里的名为准）。

当前工作区里未上架的 RC 修复（氧/LTS 本地已到 1.0.103）跟这次一起走，发布号为 1.0.104。

## 名称与简介

字符串必须如下，不得写成（GA）或水/H₂O。

**氢**（`build.mjs` 油猴头）

- `@name`：`LINUX.SB 氢`
- `@name:en`：`LINUX.SB Hydrogen`
- `@description`：`linux.sb 脚本基座：站点解析、统一网络请求、设置面板与插件挂载。请与「LINUX.SB 氧」一起使用。`
- `@description:en`：`Userscript base for linux.sb: site parsing, networked requests, settings panel, plugin host. Install LINUX.SB Oxygen for features.`

**氧**（`build-suite.mjs` 油猴头）

- `@name`：`LINUX.SB 氧`
- `@name:en`：`LINUX.SB Oxygen`
- `@description`：`linux.sb 功能套件：氢壳、实时流、未读哨兵、AI 总结、签到日历等 ${mods.length} 个模块。必须先安装「LINUX.SB 氢」。`
- `@description:en`：`Feature pack for linux.sb (shell, live feed, unread sentinel, AI summary, check-in, and more). Requires LINUX.SB Hydrogen.`

**面板**

- `src/core.js`：非 LTS 标题 `LINUX.SB · 氢`（LTS 仍是 `LINUX.SB · LTS`）
- `src/ui.js` 默认标题：`LINUX.SB · 氢`

**LTS**（`build-lts.mjs`）

- `@name` / `@name:en` 仍是 `LINUX.SB（LTS）` / `LINUX.SB (LTS)`（从氢头改写，改写规则不动）
- `@description` 仍是：`【LTS】一份脚本含基座与精简功能包。请先卸掉「LINUX.SB 氢」和「LINUX.SB 氧」。冻新功能，只修阻断。`
- `@description:en` 仍是：`[LTS] Base + feature pack in one script. Uninstall Hydrogen and Oxygen first. Feature-frozen.`
- 撞车提示仍是：`请先在油猴里关掉或卸掉「LINUX.SB 氢」和「LINUX.SB 氧」，只留 LINUX.SB（LTS）。`

## 版本

| 线 | 真源 | 新号 |
|---|---|---|
| 氢 | `src/core.js` `VERSION` 与 `package.json` | `0.1.36` |
| 氧 | `build-suite.mjs` `SUITE_VERSION` 与 `suite/suite-center.js` | `1.0.104` |
| LTS | 从氧产物读 `@version` | `1.0.104` |

功能模块 `@version` / `manifest.version` 不顺手加，除非该文件这次有行为改动。本次摘牌本身不改插件逻辑。

出包：`node build.mjs` 再 `node build-suite.mjs` 再 `node build-lts.mjs`（或 `npm run build`）。

## 测试

改 `test/suite.test.js`「Greasy Fork：氢/氧对外名称与简介标明 RC」：

- 用例名改为「不带 RC」
- `@name` 断言 `LINUX.SB 氢` / `LINUX.SB 氧`（无（RC））
- `@name:en` 断言 `LINUX.SB Hydrogen` / `LINUX.SB Oxygen`（无 `(RC)`）
- `@description` / `@description:en` 不得匹配 `【RC】` / `[RC]`
- 氢/氧全文不得再出现 `（RC）` 或 `@name` 行上的 `(RC)`

LTS 用例仍断言 `@name` 为 `LINUX.SB（LTS）`，简介含「冻新功能」。检查更新、撞车文案、592914 / 592915 / 593319 的语义不改。

全量 `npm test` 通过后再谈上架。

## 文档

文件名不动，避免论坛外链断裂。

- `docs/CONVENTIONS.md` §2.2：标题与正文改为正式版政策（上表）。删掉「不摘 RC」。油猴名改为「氢」「氧」。版本写成氢 0.1.36 / 氧 1.0.104 / LTS 1.0.104。
- `README.md` 安装段：去掉「RC」和「冻新功能，只修阻断」。LTS 仍写与氢+氧二选一、先卸氢氧。
- `docs/测试招募-氢氧-beta.md`：不再写「现在是 RC，不是正式版」。版本表与油猴名跟上。安装链仍是现有 Greasy Fork URL。
- `docs/功能征集-rc-ga.md`：开发线恢复收新功能许愿；LTS 仍不收新模块。删「不摘 RC，不进 GA」。
- `docs/已知问题-rc.md`：标题与开篇去掉 RC 冻本 / 不摘 RC。已知行为（进帖色块、通知红点、墙纸已撤、称号行情位置、AI Key 明文、楼层统计、本地联动不进公开氧）留下。「本轮不修」删「摘掉（RC）进正式版」；留下：LTS 不加新模块、不改名水/H₂O、氢不抬到 1.0.0、不恢复墙纸、帖子页不改软跳。

`docs/superpowers/specs/` 与 `plans/` 里的 RC 字样当历史记录，不改。

## 上架与 git

实现结束时给出氢 / 氧 / LTS 各一段名称、简介、changelog 粘贴稿，供人手贴 Greasy Fork。不代传、不建 Release、不打 tag。

不 commit，除非用户明确要求。

## 验收

- 三个 dist 头与上表字符串一致；氢/氧产物不含（RC）标。
- 面板非 LTS 为 `LINUX.SB · 氢`，LTS 为 `LINUX.SB · LTS`。
- 版本 0.1.36 / 1.0.104 / 1.0.104。
- `npm test` 全绿。
- 三份用户文档与 CONVENTIONS / README 不再声称「不是正式版」或「不摘 RC」；LTS 文档与简介仍写冻新功能。
