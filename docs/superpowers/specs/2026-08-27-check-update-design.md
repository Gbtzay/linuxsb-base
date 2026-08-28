# 检查更新

日期：2026-08-27  
范围：氢核心新面板页「检查更新」；抽出 `src/check-update.js`；氢 `0.1.32` → `0.1.33`。  
非目标：氧新模块、`ORDER`、自动巡检、桌面通知、油猴菜单、氢壳左栏入口、`@updateURL`、GitHub Release、按氧内插件号逐个比对、自己覆盖已装脚本、本地检查缓存。

## 问题

氢/氧故意不写 `@updateURL`，更新交给 Greasy Fork / 油猴。测试者常混装本地文件、GitHub、商店，油猴面板和氢面板里的版本对不上。需要在氢里手动对照商店，落后则打开安装页；脚本不能自己改写已安装的油猴脚本。

## 方法

氢核心能力，不是氧模块。`src/check-update.js` 记商店脚本号、解析 JSON、用现有 `parseVersion` 分类；`core.js` 挂面板。只在用户点「对照 Greasy Fork」时 `net.raw` 两条（或一条）站外 GET。安装链接打开 Greasy Fork 商店页，油猴接管安装。

## 出现位置

`core._registerCoreTabs()` 增加：

- `id`: `__core_updates`
- `name`: 检查更新
- `order`: 3（排在运行日志后面）

不改氢壳工具栏，不注册 `GM_registerMenuCommand`。

## 商店与本地版本

| 脚本 | Greasy Fork id | 本地版本 | 未装判定 |
|---|---|---|---|
| 氢 | `592914` | `VERSION`（`src/core.js`） | 不可能未装（本页就在氢里） |
| 氧 | `592915` | `plugins` 中 `id === 'suite'` 的 `version`（停用也算已装） | 名单里没有 `suite` |

JSON：`this.net.json(gfJsonUrl(id), { external: true })`（内部仍是 `raw` + `JSON.parse`，不进站内限速闸门）。需要字段 `version`（字符串）和 `url`（商店页）。`url` 为空时 `installHref` 回退到写死的安装页：

- 氢：`https://greasyfork.org/zh-CN/scripts/592914-linux-sb-%E6%B0%A2-beta`
- 氧：`https://greasyfork.org/zh-CN/scripts/592915-linux-sb-%E6%B0%A7-beta`

不请求 `code_url`，不打开 `.user.js`。

点按钮时：氢始终请求 JSON；氧仅在已装时请求。氧未装不打商店，行上仍给出安装链接。两次连点共用同一个 in-flight Promise。

## 比对

不直接调用 `compareVersion` 去分类：它对解析失败会当成 `0.0.0`。必须先 `parseVersion`；任一侧解析失败 → `invalid`。

两侧都解析成功后用 `compareVersion(local, store)`：

- `< 0` → `behind`
- `= 0` → `equal`
- `> 0` → `ahead`

`src/check-update.js` 对外（测试与 core 共用）：

```js
import { parseVersion, compareVersion } from './util.js'

export const SCRIPTS = [
  {
    id: 'hydrogen',
    gfId: 592914,
    label: '氢',
    installUrl: 'https://greasyfork.org/zh-CN/scripts/592914-linux-sb-%E6%B0%A2-beta',
  },
  {
    id: 'oxygen',
    gfId: 592915,
    label: '氧',
    installUrl: 'https://greasyfork.org/zh-CN/scripts/592915-linux-sb-%E6%B0%A7-beta',
  },
]

export function gfJsonUrl(gfId) {
  return `https://greasyfork.org/zh-CN/scripts/${gfId}.json`
}

export function parseStoreScript(json) {
  if (!json || typeof json !== 'object') return null
  const version = typeof json.version === 'string' ? json.version.trim() : ''
  if (!version) return null
  const url = typeof json.url === 'string' ? json.url.trim() : ''
  return { version, url }
}

export function classifyVersion(local, store) {
  if (!parseVersion(local) || !parseVersion(store)) return 'invalid'
  const cmp = compareVersion(local, store)
  if (cmp < 0) return 'behind'
  if (cmp > 0) return 'ahead'
  return 'equal'
}

export function localOxygenVersion(plugins) {
  const suite = (plugins || []).find((p) => p.id === 'suite')
  return suite && suite.version ? String(suite.version) : null
}

export function installHref(parsed, fallback) {
  return (parsed && parsed.url) || fallback
}
```

## 面板

打开当页立刻画两行，不联网。每行：名称、本地版本（氧未装则无版本号）。氧未装徽章「未安装」，并带「打开安装页」（`installUrl`，`target=_blank` `rel=noopener noreferrer`）。

页顶按钮：`对照 Greasy Fork`。进行中：文案 `查询中…`、disabled。结束后恢复。不 toast。

页脚（始终显示）：`安装仍由油猴接管；两个都要装，先氢后氧。`

查询结束后按行更新，不清掉本地版本：

| 状态 | 徽章文案 | 行说明 | 安装按钮 |
|---|---|---|---|
| `behind` | 有更新 | 本地 `x` · 商店 `y` | 有，href = JSON `url` 或回退 `installUrl` |
| `equal` | 已是最新 | 本地与商店同为 `x` | 无 |
| `ahead` | 比商店新 | 本地 `x` · 商店 `y` | 无 |
| `missing` | 未安装 | （氧） | 有，href = `installUrl` |
| `invalid` | 版本号无效 | 本地或商店的原始字符串 | 无 |
| 请求失败 | 查询失败 | `无法读取 Greasy Fork` 或跨域句 | 无 |

徽章 class：`有更新` / `查询失败` / `版本号无效` → `lsb-badge is-err`；`已是最新` → `lsb-badge is-on`；`比商店新` / `未安装` → `lsb-badge`。

安装按钮 class：`lsb-btn is-primary`，文案 `打开安装页`。

## 错误

只写在该行，不影响另一行。`Promise.allSettled`。原因文案：

- HTTP 非 2xx / 网络抛错 / 响应不是对象 / `parseStoreScript` 返回 null → 徽章 `查询失败`，说明 `无法读取 Greasy Fork`
- `net.raw` 抛出的信息含 `@connect` 或 `跨域` → 徽章 `查询失败`，说明 `氢需要允许 greasyfork.org 跨域`
- 不弹 toast；该次检查最多 `this.log` 一条（不要每行一条）

无本地 `store` 键。关面板再开会回到「未查询」初始两行。

## 生命周期

无定时器、无 `election`、无 DOM 常驻节点（只在面板 render 里画）。`onDispose` 不需要新资源。按钮 in-flight 随面板实例；面板关掉不强制 abort（基座 `net.raw` 无 abort），但结果回来时若 view 已换页则丢弃（generation 令牌）。

## 测试

`test/check-update.test.js`（纯函数，不 boot 面板）：

- `gfJsonUrl(592914)` / `592915` 指向上述 JSON 地址
- `parseStoreScript` 抽出 `version` 与 `url`；缺 version 返回 null
- `classifyVersion`：`0.1.31` vs `0.1.32` → behind；相同 → equal；本地 `0.1.33` vs 商店 `0.1.32` → ahead；`foo` → invalid
- `localOxygenVersion([{ id: 'suite', version: '1.0.83' }])` → `1.0.83`；无 suite → `null`；`suite` 为 `disabled` 仍返回 version

`test/core.test.js`：

- 核心 tab 现为四页：`__core_plugins` / `__core_settings` / `__core_logs` / `__core_updates`（改掉「三个面板页」断言）
- 打开检查更新页：出现氢、氧两行和「对照 Greasy Fork」；此时 `net.json` 调用次数为 0
- stub `net.json`：点按钮后氢 JSON 被请求且 `external: true`；有 `suite` 时氧 JSON 也被请求；无 `suite` 时不请求氧 JSON
- 氢商店版本更高：该行有「有更新」和指向商店 `url` 的「打开安装页」
- 无 `suite`：未点按钮即「未安装」+ 氧 `installUrl`
- 氢 JSON 失败、氧 JSON 成功：氢「查询失败」，氧仍按成功结果画
- 连点按钮：`net.json` 不会翻倍（in-flight 复用）

夹具是内存里的 JSON 对象，不打真实 Greasy Fork。

## 版本与文档

氢：`src/core.js` 的 `VERSION`、`package.json` 的 `version` 改为 `0.1.33`（`build.mjs` 油猴头从 `VERSION` 读取）。氧版本不动。

同步冻本文案：`docs/CONVENTIONS.md`、`docs/已知问题-rc.md`、`docs/测试招募-氢氧-beta.md`、`docs/功能征集-rc-ga.md`（氢号改为 0.1.33；「已经有的」加上「检查更新」）。不改氧 `ORDER`。
