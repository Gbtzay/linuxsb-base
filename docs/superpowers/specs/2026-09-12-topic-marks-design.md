# 红包 / 发卡：列表高亮与机会监控

日期：2026-09-12  
范围：`src/site.js` `parseListItem`；新模块 `plugins/topic-marks.user.js`；`plugins/forum-watch.user.js`；`suite/order.js`；`README.md`；`docs/CONVENTIONS.md` §2.2；`docs/功能征集-rc-ga.md`「已经有的」。氢 `0.1.39` → `0.1.40`；`topic-marks` `1.0.0`；机会监控 `1.0.1` → `1.0.2`；氧 / LTS `1.0.110` → `1.0.111`。  
非目标：淘帖专辑；列表筛选；进帖核对剩余；代领 / 代抢（任何 POST）；`/topic/` 软跳；实时流改卡片；LTS 加模块或高亮；改产品名；发 Release。

## 问题

v9.0 列表标题旁已有 `.red-packet-title-status`（「红包帖」）和 `.virtual-card-title-status`（「发卡中 / 结束」）。氢只把这些字推进 `badges`。机会监控只扫标题关键词。逛列表分不出还活着的行；想盯红包必须把词写进标题。

## 方法

氢把标记收成结构化 `marks`。氧新模块只给 `live` 行画左侧色条。机会监控加两个默认关的开关，开了才按 `live` 命中。LTS 冻新功能：解析字段跟着氢进包，不画、不加开关。

## 1. 氢：`marks`

`parseListItem` 增加字段，`badges` 数组不删、不改选取范围。

```
marks: { redPacket: 'live' | 'ended' | null, virtualCard: 'live' | 'ended' | null }
```

选择器仍只在 `site.js`：`.red-packet-title-status`、`.virtual-card-title-status`。

**红包**（看红包节点）：

- 没有节点 → `null`
- 节点 class 或文案匹配 `/结束|已抢|抢完|已领|ended|expired/i` → `ended`
- 其余有节点（含「红包帖」）→ `live`

**发卡**（看发卡节点）：

- 没有节点 → `null`
- 先套结束规则：class 或文案匹配 `/结束|已结束|已发完|ended|expired/i` → `ended`（与 `active` 同时出现时结束赢）
- 否则 class 含 `active`，或文案匹配 `/发卡中|发放中/` → `live`
- 有节点但认不出 → `ended`

淘帖专辑行、`post-entry`、标题指向 `/topic_collection/` 仍整条返回 `null`，没有 `marks`。`api.parse.list` / `listItem` 自动带上该字段。旧氢没有 `marks` 时，氧用 `it.marks?.redPacket === 'live'`，当没有标记，不抛错。`topic-marks` 的 `requires.base` 仍写 `^0.1.0`。

## 2. 氧：`topic-marks`

| 项 | 值 |
|---|---|
| `id` | `topic-marks` |
| `@name` / `name` | LSB·红包发卡 / 红包发卡 |
| `version` | `1.0.0`（头与 manifest 一致） |
| 权限 | `read` `ui` `events`（无 storage、无 write） |
| 配置 | 无。关掉模块即关高亮 |
| `ORDER` | 紧挨 `read-mark` 之后 |
| `ORDER_LTS` | 不进 |
| `SUITE_EXCLUDE` | 不进 |

只给当前文档里 `parse.listItem` 得到 `live` 的 `li` 加 class，不插节点、不加筛选、不改站点徽章。已读置灰的透明度仍在，色条仍可见。

| class | 条件 | 样式 |
|---|---|---|
| `lsb-topic-mark-red` | `marks.redPacket === 'live'` | `box-shadow: inset 3px 0 0 #e11d48` |
| `lsb-topic-mark-card` | `marks.virtualCard === 'live'` | `box-shadow: inset 3px 0 0 #d97706` |
| 两个都有 | 两条 class | 必须再用组合选择器写 `inset 3px 0 0 #e11d48, inset 6px 0 0 #d97706`，否则后写的单条会盖掉红线 |

样式节点 id：`lsb-topic-marks-style`。`ended` 或没有标记：两个 class 都不加；已经加上的，重涂时摘掉。

涂色时机与已读置灰相同：`api.dom.each(api.sel.listItems, paint)`；`route:changed` 后全量重涂。`paint` 幂等。`onDispose` 去掉 style 节点，并摘掉文档里这两个 class。

氧面板 Tab「红包发卡」（`order` 41，已读置灰为 40）：一段说明，无表单。文案写明高亮范围，以及盯红包 / 盯发卡在机会监控里。

`topic-marks:debug`：`painted()`（当前带任一 class 的行数）、`liveRed()`、`liveCard()`。

不设左栏工具按钮（没有要打开的浮层）。

## 3. 机会监控

配置增加，默认关：

- `watchRedPacket` 开关，标签：盯红包（列表标记为活着）
- `watchVirtualCard` 开关，标签：盯发卡（列表标记为活着）

关键词、版块 id、间隔、桌面通知含义不变。巡检仍只 `api.net.doc(api.routes.forum(fid, { sort: 'post' }))`，用 `api.parse.list`，不拉帖页。

何时巡检：关键词非空，**或**任一新开关为开。否则和现在一样直接返回。版块 id 仍为空则不发请求。

命中（仅「该版块第一次见到该 tid」）：

1. 标题（小写）包含某个关键词 → 记该词（多个都中时仍取第一个，与现在相同）
2. `watchRedPacket` 且 `marks.redPacket === 'live'` → 记「红包」
3. `watchVirtualCard` 且 `marks.virtualCard === 'live'` → 记「发卡」

以上任一条成立才入箱。`ended` 不入。后补的红包不再喊（与关键词同一水位）。

命中对象：

- `reasons`：字符串数组，顺序为关键词、红包、发卡（有则写入）
- `kw`：`reasons.join(' · ')`（只中关键词时仍是那个词，旧测试继续过）
- `tid` `title` `forumId` `author` `ts` 不变

面板「命中「…」」仍读 `kw`。年度报告只数 `hits` 条数。桌面通知 body 仍是标题。`forum-watch:debug` 的 `hits` / `tick` / `forget` / `probe` 保留；`probe` 增加 `watchRedPacket`、`watchVirtualCard`。模块版本 `1.0.2`。

## 4. 版本与文档

- 氢 `VERSION` / `package.json`：`0.1.40`
- 氧 / LTS `SUITE_VERSION` 与 LTS `@version`：`1.0.111`（LTS 只对齐号并带上 `marks` 字段，不加模块）
- `docs/CONVENTIONS.md` §2.2 与 `docs/功能征集-rc-ga.md`「已经有的」写上红包发卡；征集不收项不改
- README 插件表：`topic-marks` 一行；`forum-watch` 行补一句可按红包 / 发卡标记盯

## 5. 测试

氢 `test/site.test.js`：

- 「红包帖」→ `redPacket: 'live'`
- `active` + 「发卡中」→ `virtualCard: 'live'`
- 「结束」「已抢完」→ 对应 `ended`
- 发卡节点无 `active`、文案也不是发卡中 / 发放中 → `ended`
- 无节点 → 两个都是 `null`
- `badges` 仍含原文字；淘帖行仍不是列表项

新 `test/topic-marks.test.js`：

- 只给 `live` 加对应 class；`ended` 不加
- 两个 `live` 两条 class
- 软跳后能摘能补
- dispose 去掉 style 与 class

`test/batch3.test.js` 机会监控：

- 现有关键词命中 / 水位 / forget 仍过
- 开关关、列表上有红包帖：不因标记入箱
- 关键词空、只开盯红包：活着的红包入箱，`kw === '红包'`，结束态不入
- 同一 tid 第二轮不重复入箱

套件：`ORDER` 含 `topic-marks`；`test/suite.test.js` 与 `test/lts.test.js` 里「LTS 不得出现」的 id 列表加上 `topic-marks`。LTS 运行时 `info().plugins` 无此 id。

## 硬约束

不 POST 领红包 / 领卡。不 GET `?tab=notifications`。不改 `isSpaUrl`。不把高亮或开关打进 LTS。选择器不写进插件。
