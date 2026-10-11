# 核心非 AI 回归测试重整设计

## 背景

当前 `npm test` 依赖 Node.js 测试运行器的默认发现规则，会一次运行 `test/` 下全部测试。最近一次基线为 942 个测试，耗时约 209 秒，并出现 2 个只在完整并发运行时失败、单独运行可通过的时序失败。AI 测试占据了较大的测试量和运行时间，但普通插件开发最常修改的是基座、站点适配、实时流、已读和 skin 壳行为。

项目需要保留完整发布回归，同时让默认开发回归聚焦于非 AI 核心行为，并且让不同范围的测试可以通过稳定、跨平台的命令单独运行。

## 目标

1. 将 `npm test` 定义为核心非 AI 回归，而不是依赖默认发现规则的全部测试。
2. 保留现有测试用例，不因为默认命令变快而删除 AI 或壳回归。
3. 提供一个显式的完整回归命令，覆盖当前 `npm test` 原本发现的全部测试。
4. 提供实时流/已读、skin 壳和 AI 三个专项入口，缩短定位问题的反馈路径。
5. 通过统一测试调度脚本消除 `package.json` 中的长文件列表，并使新测试文件自动进入正确的套件。
6. 降低完整测试的文件级并发，避免当前已观察到的并发/时序假失败。
7. 清理测试夹具产生的 jsdom `window.scrollTo` 未实现错误噪声，不改变生产行为或断言语义。

## 非目标

- 不修改生产插件、基座、软跳逻辑或业务行为。
- 不合并或删除 `live-feed.test.js`、`live-feed-v2.test.js`、`read-mark.test.js`、`skin.test.js` 或 `skin-canvas.test.js` 中的回归场景。
- 不把浏览器冒烟、分发校验和构建命令偷偷并入 Node 默认回归；这些仍由现有显式命令负责。
- 不改变测试夹具所验证的页面结构、测试名称或断言内容，除非只是为稳定等待补充必要的条件轮询。

## 测试套件边界

统一调度脚本读取 `test/*.test.js` 的直接子文件，并按文件名选择套件：

- **core**：所有测试文件，排除文件名以 `ai-` 开头的文件。包含基座、站点、普通插件、实时流/已读、skin/skin-canvas、套件、构建配置和分发契约测试。
- **all**：所有测试文件，包括 AI 测试。它是原完整 `npm test` 的替代入口。
- **ai**：所有文件名以 `ai-` 开头的测试，仅用于 AI 相关开发和诊断。
- **live-feed**：固定运行 `live-feed.test.js`、`live-feed-v2.test.js` 和 `read-mark.test.js`。
- **skin**：固定运行 `skin.test.js` 和 `skin-canvas.test.js`。

不使用测试名称正则来模拟文件筛选，也不依赖 shell 的 glob 排除语法；这样在 Windows PowerShell、Windows cmd 和 Unix shell 下都使用相同的文件集合。

## 命令接口

`package.json` 提供以下入口：

```text
npm test                 核心非 AI 回归，等价于测试调度器的 core 套件
npm run test:all         完整回归，包含 AI 测试
npm run test:ai          只运行 AI 测试
npm run test:live-feed   实时流与已读快速回归
npm run test:skin        skin 与 skin-canvas 壳回归
```

现有 `npm test` 的 Node.js 测试参数继续保留 `--test-force-exit`。统一调度器使用 `spawn` 运行当前 Node 可执行文件，并把子进程退出码、信号和标准输入输出原样传递给调用方；测试失败时命令必须返回非零状态。

## 并发与稳定性

默认 core 和显式 all 套件使用较低的文件并发，优先避免 JSDOM、定时器和软跳历史状态在并行文件之间造成时序假失败。live-feed 与 skin 专项也沿用相同参数，保证专项结果与默认回归一致。

AI 测试从默认 core 中移出后，AI 文件仍通过 `test:all` 和 `test:ai` 运行；因此缩短默认反馈不等于降低发布前覆盖。完整套件的基准耗时和测试数量在 README 中只记录为测量结果，不写成硬性断言，以免环境差异造成文档失真。

## 测试夹具更新

在会加载 skin 或会触发壳刷新但尚未提供滚动实现的 JSDOM 夹具中设置空的 `window.scrollTo` 实现，至少覆盖 AI 工作台和未读哨兵夹具。该设置只模拟浏览器已有 API，不屏蔽业务错误，也不改变滚动断言；目的是消除 `Not implemented: window.scrollTo` 的 stderr 噪声。

当前完整套件中单独通过、并发失败的软跳后退和 AI 导入取消用例先按现有断言保留。调度器改为较低并发后重新验证；只有仍然可复现时，才按测试驱动方式分别修复其等待条件，并为修复保留回归断言。

## 文档更新

README 的开发命令表增加五个入口，并说明：

- 日常基座/普通插件开发使用 `npm test`；
- 实时流或已读改动优先使用 `npm run test:live-feed`；
- 壳和软跳改动优先使用 `npm run test:skin`；
- AI 改动使用 `npm run test:ai`；
- 发布前使用 `npm run test:all`，随后继续执行构建、产物校验和浏览器冒烟。

`docs/CONVENTIONS.md` 的测试约定同步说明默认 core 与发布 all 的区别，避免后续开发者误以为 `npm test` 已经覆盖 AI。

## 验收标准

1. `npm test` 只运行 core 套件，统计结果中不出现 AI 测试名称，并返回 0。
2. `npm run test:live-feed` 运行 45 个实时流/已读用例并返回 0。
3. `npm run test:skin` 运行 skin 与 skin-canvas 用例并返回 0。
4. `npm run test:ai` 只运行 AI 文件；其结果独立于 core 命令。
5. `npm run test:all` 运行全部测试文件，覆盖原 942 个测试集合；任何已知失败都必须明确记录，不得通过隐藏失败或删除断言来“变绿”。
6. 调度器在 Windows 环境使用当前项目的 Node 可执行文件，并正确传递失败退出码。
7. 运行核心及完整命令时不再输出由测试夹具主动触发的 `window.scrollTo` 未实现错误。
8. `git diff --check` 通过，且改动仅涉及测试调度、测试夹具、package scripts 和测试说明文档。
