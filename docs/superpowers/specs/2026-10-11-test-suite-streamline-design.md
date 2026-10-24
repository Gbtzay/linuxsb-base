# 测试套件重整设计

## 背景

前一轮调度重整已经把 `npm test` 从全部文件改为核心非 AI 文件回归，但当前实测仍包含 673 个测试条目（621 通过、52 跳过）、耗时约 137.6 秒。它会把实时流、完整 skin、构建/套件契约和其它集成回归一起带入每次日常反馈，仍然过慢。

本次后续调整保留这套完整非 AI 回归，同时根据实际开发中最常修改的基础、站点、导航和运行时壳路径建立固定快速集合。AI、实时流、skin 和构建契约测试继续保留在显式入口中，不因默认命令变快而删除场景。

## 目标

1. 将 `npm test` 定义为固定、可审计的日常快速回归，实测约 10.6 秒，而不是再次运行全部核心文件。
2. 提供 `npm run test:core` 作为完整非 AI 文件回归，保留前一轮 `core` 的覆盖范围。
3. 保留现有测试用例，不因为默认命令变快而删除 AI、实时流、skin、构建或套件契约回归。
4. 提供显式的完整回归、AI、实时流/已读和 skin 壳入口，缩短定位问题的反馈路径。
5. 通过统一测试调度脚本维护固定快速清单与自动发现的完整清单，并使新测试文件自动进入正确的完整套件。
6. 继续使用较低的文件级并发，避免 JSDOM、定时器和软跳历史状态在并行文件之间造成时序假失败。
7. 清理测试夹具产生的 jsdom `window.scrollTo` 未实现错误噪声，不改变生产行为或断言语义。

## 非目标

- 不修改生产插件、基座、软跳逻辑或业务行为。
- 不合并或删除 `live-feed.test.js`、`live-feed-v2.test.js`、`read-mark.test.js`、`skin.test.js` 或 `skin-canvas.test.js` 中的回归场景。
- 不把浏览器冒烟、分发校验和构建命令偷偷并入 Node 默认回归；这些仍由现有显式命令负责。
- 不改变测试夹具所验证的页面结构、测试名称或断言内容，除非只是为稳定等待补充必要的条件轮询。

## 测试套件边界

统一调度脚本读取 `test/*.test.js` 的直接子文件，并按文件名或固定清单选择套件：

- **quick**：固定运行基础通信、检查更新、基座、DOM、选主、错误隔离、首页回位、网络、路由、运行时能力、壳布局/媒体/滚动/令牌、站点解析、存储和测试调度器共 19 个文件；当前实测 181 个用例全部通过，约 10.6 秒。它不加载 `test/ai-*.test.js`，也不包含实时流、完整 skin、构建与套件契约等重型文件。
- **core**：所有测试文件，排除文件名以 `ai-` 开头的文件。它是完整非 AI 文件回归，包含实时流/已读、skin/skin-canvas、套件、构建配置和分发契约测试。
- **all**：所有测试文件，包括 AI 测试。它是发布前完整 Node 回归。
- **ai**：所有文件名以 `ai-` 开头的测试，仅用于 AI 相关开发和诊断。
- **live-feed**：固定运行 `live-feed.test.js`、`live-feed-v2.test.js` 和 `read-mark.test.js`。
- **skin**：固定运行 `skin.test.js` 和 `skin-canvas.test.js`。

快速集合和专项集合都在 `scripts/run-tests.mjs` 中明确列出；固定文件缺失时调度器直接报错，不会静默缩小覆盖范围。不使用测试名称正则来模拟文件筛选，也不依赖 shell 的 glob 排除语法；这样在 Windows PowerShell、Windows cmd 和 Unix shell 下都使用相同的文件集合。

## 命令接口

`package.json` 提供以下入口：

```text
npm test                 日常快速回归，等价于调度器的 quick 套件
npm run test:quick       日常快速回归的显式入口
npm run test:core        完整非 AI 文件回归
npm run test:all         完整回归，包含 AI 测试
npm run test:ai          只运行 AI 测试
npm run test:live-feed   实时流与已读专项回归
npm run test:skin        skin 与 skin-canvas 壳回归
```

现有 Node.js 测试参数继续保留 `--test-force-exit`。统一调度器使用 `spawn` 运行当前 Node 可执行文件，并把子进程退出码、信号和标准输入输出原样传递给调用方；测试失败时命令必须返回非零状态。

## 并发与稳定性

quick、core、all 以及 live-feed、skin 专项都使用较低的文件并发；quick 以固定短清单缩短反馈，core/all 则保留完整覆盖，避免把“默认变快”误解为删除回归。AI 测试从 quick 中移出后，仍通过 `test:all` 和 `test:ai` 运行。完整套件的基准耗时和测试数量在文档中只记录测量结果，不写成跨环境硬性断言。

## 测试夹具更新

在会加载 skin 或会触发壳刷新但尚未提供滚动实现的 JSDOM 夹具中设置空的 `window.scrollTo` 实现，至少覆盖 AI 工作台和未读哨兵夹具。该设置只模拟浏览器已有 API，不屏蔽业务错误，也不改变滚动断言；目的是消除 `Not implemented: window.scrollTo` 的 stderr 噪声。

当前完整套件中单独通过、并发失败的软跳后退和 AI 导入取消用例先按现有断言保留。调度器改为较低并发后重新验证；只有仍然可复现时，才按测试驱动方式分别修复其等待条件，并为修复保留回归断言。

## 文档更新

README 的开发命令表增加快速、完整非 AI、完整、AI、实时流/已读和 skin 入口，并说明：

- 日常基座、站点和普通导航开发使用 `npm test`；
- 需要完整非 AI 覆盖时使用 `npm run test:core`；
- 实时流或已读改动优先使用 `npm run test:live-feed`；
- 壳和软跳改动优先使用 `npm run test:skin`；
- AI 改动使用 `npm run test:ai`；
- 发布前使用 `npm run test:all`，随后继续执行构建、产物校验和浏览器冒烟。

`docs/CONVENTIONS.md` 的测试约定同步说明 quick、core 与 all 的区别，避免后续开发者误以为 `npm test` 已经覆盖所有非 AI 文件。

## 验收标准

1. `npm test` 和 `npm run test:quick` 只运行 quick 固定清单，当前实测 181 个用例并返回 0。
2. `npm run test:core` 运行所有非 AI 测试文件，保留前一轮 core 覆盖范围并返回 0。
3. `npm run test:live-feed` 运行实时流与已读专项并返回 0；`npm run test:skin` 运行 skin 与 skin-canvas 用例并返回 0。
4. `npm run test:ai` 只运行 AI 文件；其结果独立于 quick/core 命令。
5. `npm run test:all` 运行全部测试文件，覆盖完整发布回归；任何失败都必须明确记录，不得通过隐藏失败或删除断言来“变绿”。
6. 调度器在 Windows 环境使用当前项目的 Node 可执行文件，并正确传递失败退出码。
7. 运行核心及完整命令时不再输出由测试夹具主动触发的 `window.scrollTo` 未实现错误。
8. `git diff --check` 通过，且改动仅涉及测试调度、测试夹具、package scripts 和测试说明文档。
