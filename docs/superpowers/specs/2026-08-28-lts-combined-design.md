# LINUX.SB（LTS / LTSC）：一份精简脚本顶氢+氧

日期：2026-08-28  
范围：新增 LTS 合成产物与频道检测；LTS 只打 `ORDER_LTS` 精简集；氢「检查更新」在 LTS 包内只对照一条商店；开发线氢/氧 Greasy Fork 与 RC 名称不动。  
非目标：把氢抬到 `1.0.0`、改名水/H₂O、油猴脚本互卸、`@require` 氢、LTS 收录下列砍掉的模块、自动建 Greasy Fork 页、给开发线也合成一份、把氧全家桶改成精简集。

## 问题

多数人要装两份脚本（氢 592914、氧 592915），顺序错或漏装就会「只有壳没有功能」。LTS 要单独一条线：冻新功能、只修站点断裂；开发线继续双脚本加功能。LTS 必须一份油猴脚本就能用，并且按 LTSC 思路 **不装会拖流畅度或非日常刚需的模块**（源码不打进包，不是默认关掉）。

## 频道

| | 商店 | 产物 | 政策 |
|---|---|---|---|
| 开发 | 592914 氢（RC）+ 592915 氧（RC） | `linuxsb-base.user.js` + `linuxsb-suite.user.js`（`ORDER` 全家桶） | 可加功能；名称与检查更新仍两行 |
| LTS | **新开一页**（脚本号写入 `check-update.js` 的 `lts.gfId`） | `dist/linuxsb-lts.user.js`（基座 + `ORDER_LTS`） | 冻新功能；只修装不上、页面花、请求打爆、数据丢 |

第一发 LTS 打当时主线冻本（含已合入的氢壳软跳、主栏存档、存档后台刷新）。未合入的先合入再打 LTS 包。性能探针不进 LTS。

## 收录（`suite/order.js` 的 `ORDER_LTS`）

与 `ORDER` 同序，只少砍掉的 id。套件中心仍打进 LTS，`__SUITE_MEMBERS__` 注入 `ORDER_LTS`（总览卡片不要出现未打包的模块）。

**留下：** `floor-stats`、`resume-reading`、`read-mark`、`home-return`、`topic-preview`、`unread-sentinel`、`checkin-calendar`、`points-ledger`、`data-migration`、`annual-report`、`skin`、`live-feed`。

**不打进 LTS：** `title-quotes`（行情）、`forum-watch`（机会监控）、`ai-summary`、`my-archive`（个人存档）、`hot-floor-badge`（高频标记）、`perf-probe`、`hover-profile`（悬停画像）、以及已有的 `local-bridge`。

楼层统计留下、高频标记去掉（后者依赖前者，去掉标记即可）。年度报告缺个人存档时按现有逻辑降级。

不要做成「全家桶都在、默认停用」——那样注册和源码仍在，流畅度省不下来。

## 产物

`build-lts.mjs`（`npm run build` 末尾调用）在氢已打出后：

1. 剥掉 `linuxsb-base.user.js` 的油猴头，留下 IIFE。
2. 按 `ORDER_LTS` 读 `plugins/<id>.user.js`，剥内嵌头后拼接；再拼 `suite-center.js`（成员列表为 `ORDER_LTS`）。不要整份 `linuxsb-suite.user.js`（那是全家桶）。
3. 写成 **一段** 油猴头 + 包装 IIFE。

`LTS @version` 与当时 `SUITE_VERSION` 相同。

油猴头：

- `@name` `LINUX.SB（LTS）`；`@name:en` `LINUX.SB (LTS)`
- `@version` 与当时 `SUITE_VERSION` 相同（第一发与氧冻本对齐，例如 `1.0.100`）
- `@description` 写明：一份脚本含基座与精简功能包；请先卸掉氢和氧；冻新功能
- `@run-at document-start`；`@grant` / `@connect` / `@match` / `@noframes` 与氢头相同
- 不要 `@updateURL`

包装 IIFE 在评估基座之前：

```text
W = unsafeWindow || window
若在 iframe：直接 return
若 W.LSB && W.LSB.__core：提示后 return（不执行基座、不执行 LTS 模块）
否则：W.__LSB_CHANNEL__ = 'lts'；W.__LSB_LTS_VERSION__ = '<SUITE_VERSION>'
然后依次执行基座 IIFE、ORDER_LTS 模块、套件中心
```

基座 `entry.js` 已有「已存在则 return」；LTS **不能**依赖它——否则包装仍会执行后面的模块，把插件注册进别人的氢。必须在包装层拦住。

撞车提示：不依赖基座 UI。插一条 `position:fixed` 短条（或已有 `.lsb-toast-host` 则复用），8 秒后移除。文案固定：

> 请先在油猴里关掉或卸掉「LINUX.SB 氢」和「LINUX.SB 氧」，只留 LINUX.SB（LTS）。

不调用 `GM_setValue` 去改其它脚本。说明文档同样写这句。

若只忘了卸氧：LTS 已 `document-start` 占住 `LSB`，后到的氧 `register` 同 id 会被基座忽略。仍要求两个都卸，避免油猴列表里三份并存。

## 运行时（仅 LTS 包）

`__LSB_CHANNEL__ === 'lts'` 时：

- 面板标题 `LINUX.SB · LTS`，标题旁版本为 `__LSB_LTS_VERSION__`（氧号），不要只显示氢 `0.1.33`
- `LSB.version` 仍是氢 `VERSION`（插件 `requires.base: '^0.1.0'` 不能破）
- 「检查更新」只一行：标签「LTS」，本地号 `__LSB_LTS_VERSION__`，对照 `SCRIPTS` 里 `id:'lts'` 的 Greasy Fork JSON
- `lts.gfId` 未建页前为 `null`：按钮可点，不发请求，说明「LTS 商店页公布后即可对照」
- 页脚不要写「两个都要装，先氢后氧」

开发线氢不读 `__LSB_CHANNEL__`（未设置），检查更新仍两行 592914 / 592915。

`src/check-update.js` 增加：

```js
{ id: 'lts', gfId: null, label: 'LTS', installUrl: '' }
```

建页后把 `gfId` 和 `installUrl` 填成真实地址。氢 `0.1.33` 不为此抬号，除非检查更新/标题分支改了 `src/`——若改了 `src/`，氢补丁号 +1，开发线也带上这段分支（未设 channel 时行为与现在完全一样）。

## 外形

油猴列表出现「LINUX.SB（LTS）」。打开 linux.sb 后右下角仍是 H 钮；面板标题为 LTS。套件总览只出现 `ORDER_LTS` 里的模块。不要水/H₂O。

## 测试

- `linuxsb-lts.user.js` 只有一段 `==UserScript==`；`@name` 为 LTS；`@run-at document-start`；含氢 grant；正文含 `skin` 与 `live-feed`；不含 `local-bridge`、`title-quotes`、`forum-watch`、`ai-summary`、`my-archive`、`hot-floor-badge`、`perf-probe`、`hover-profile`
- `ORDER_LTS` 是 `ORDER` 的子集（构建/测试双重校验）
- 无 BOM / 统一 LF；`new Function` 可解析
- 先 `eval` 氢再 `eval` LTS：LTS 不第二次 `boot`，`LSB.info().plugins` 不因 LTS 再涨一套模块；页面出现上述撞车文案
- 只 `eval` LTS：`ORDER_LTS` 每个 id 都在 `LSB.info().plugins` 且为 active；砍掉的 id 不在其中；面板标题含 `LTS`，标题旁版本为 `SUITE_VERSION`
- 开发线氢/氧「标明 RC」的用例仍过；氧全家桶仍含被 LTS 砍掉的模块
- 检查更新：channel 未设时仍两行；LTS 包一行；`gfId == null` 不请求 greasyfork.org

## 版本

- 氢：仅当 `src/` 为 LTS 频道加了分支才 `0.1.33` → `0.1.34`；否则氢号不动
- 氧 / `SUITE_VERSION`：不因「会打进 LTS」单独加号
- LTS `@version` = 当时 `SUITE_VERSION`
- 文档：CONVENTIONS / 招募增加 LTS 一行并写明精简集；氢/氧 RC 表保留
