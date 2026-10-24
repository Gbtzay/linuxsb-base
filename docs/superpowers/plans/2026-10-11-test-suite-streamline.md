# 日常快速回归与完整测试入口实施计划

> 本计划先完成了自动发现的 core 套件。后续测量显示 core 仍过慢，因此当前默认入口改为固定 quick 清单，原 core 覆盖保留为 `npm run test:core`；具体边界以同名设计文档和 `scripts/run-tests.mjs` 为准。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `npm test` 改为稳定、跨平台的日常快速回归，同时保留可显式运行的完整非 AI、完整 AI、实时流/已读和 skin 测试入口。

**Architecture:** `scripts/run-tests.mjs` 作为唯一测试调度器，读取 `test/` 直接子目录中的测试文件，按 quick 固定清单或 core/all/AI/专项规则筛选后启动当前 Node 进程的测试运行器。`npm test` 与 `test:quick` 调度 quick 套件；`test:core` 调度全部非 AI 文件；`test:all` 调度全部文件。测试文件本身不搬迁、不合并，JSDOM 夹具只补齐浏览器已有的 `window.scrollTo` API。

**Tech Stack:** Node.js ESM、`node:test`、JSDOM、npm scripts、Markdown。

## Global Constraints

- 不修改生产插件、基座、软跳逻辑或业务行为。
- 不合并或删除 `live-feed.test.js`、`live-feed-v2.test.js`、`read-mark.test.js`、`skin.test.js` 或 `skin-canvas.test.js` 中的回归场景。
- `quick` 是 `scripts/run-tests.mjs` 中明确列出的日常快速文件集合；当前包含基础、站点、导航、运行时能力和壳原语文件，不包含实时流、完整 skin、构建与套件契约等重型文件，也不包含 `ai-*.test.js` 文件。
- `core` 套件包含所有 `test/*.test.js`，排除文件名以 `ai-` 开头的文件，是完整非 AI 文件回归。
- `all` 套件包含所有 `test/*.test.js`；`ai` 套件只包含文件名以 `ai-` 开头的文件。
- `live-feed` 固定包含 `live-feed.test.js`、`live-feed-v2.test.js`、`read-mark.test.js`；`skin` 固定包含 `skin.test.js`、`skin-canvas.test.js`。
- 所有套件使用 `--test-force-exit` 和较低的文件级并发 `--test-concurrency=2`。
- 调度器必须使用当前 Node 可执行文件，原样继承子进程标准输入、输出、错误，并传递非零退出状态。
- 不依赖 shell glob 排除语法；Windows PowerShell、Windows cmd 和 Unix shell 必须选择同一批文件。
- 不清理、覆盖或回退工作区中与本计划无关的未提交改动；不提交生成的分发产物。

---

### Task 1：建立跨平台测试调度器和 npm 套件入口

**Files:**
- Create: `scripts/run-tests.mjs`
- Create: `test/test-runner.test.js`
- Modify: `package.json` 的 `scripts`

**Interfaces:**
- `selectTestFiles(files, suite)`：接收测试文件名数组和套件名，返回 quick 固定清单或排序后的完整/专项文件名数组；支持 `quick`、`core`、`all`、`ai`、`live-feed`、`skin`。
- `main(argv)`：解析第一个参数为套件名，剩余参数原样传给 Node 测试运行器；无套件参数时使用 `quick`。
- npm 入口为 `test`、`test:quick`、`test:core`、`test:all`、`test:ai`、`test:live-feed`、`test:skin`。

- [ ] **Step 1：先写套件选择失败测试**

创建 `test/test-runner.test.js`，从 `scripts/run-tests.mjs` 导入 `selectTestFiles`，覆盖以下行为：

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectTestFiles } from '../scripts/run-tests.mjs'

test('core 套件排除 AI 文件但保留普通回归', () => {
  const files = ['ai-summary.test.js', 'core.test.js', 'skin.test.js', 'ai-copilot.test.js']
  assert.deepEqual(selectTestFiles(files, 'core'), ['core.test.js', 'skin.test.js'])
})

test('all 和 ai 套件按文件名选择', () => {
  const files = ['ai-summary.test.js', 'core.test.js', 'ai-copilot.test.js']
  assert.deepEqual(selectTestFiles(files, 'all'), files.slice().sort())
  assert.deepEqual(selectTestFiles(files, 'ai'), ['ai-copilot.test.js', 'ai-summary.test.js'])
})

test('专项套件固定选择实时流和 skin 文件', () => {
  const files = [
    'skin-canvas.test.js', 'read-mark.test.js', 'core.test.js',
    'live-feed-v2.test.js', 'live-feed.test.js', 'skin.test.js',
  ]
  assert.deepEqual(selectTestFiles(files, 'live-feed'), [
    'live-feed.test.js', 'live-feed-v2.test.js', 'read-mark.test.js',
  ])
  assert.deepEqual(selectTestFiles(files, 'skin'), ['skin-canvas.test.js', 'skin.test.js'])
})

test('未知套件直接拒绝，避免静默运行错误范围', () => {
  assert.throws(() => selectTestFiles(['core.test.js'], 'unknown'), /Unknown test suite/)
})
```

- [ ] **Step 2：运行测试确认当前缺少调度器**

运行：

```bash
node --test --test-force-exit test/test-runner.test.js
```

预期：测试因 `scripts/run-tests.mjs` 尚不存在而失败，不能把缺少模块误判为断言通过。

- [ ] **Step 3：实现最小套件选择和子进程调度**

在 `scripts/run-tests.mjs` 中：

1. 导出 `selectTestFiles`；
2. 使用 `readdir` 读取 `new URL('../test/', import.meta.url)` 的直接文件；
3. 只保留名称以 `.test.js` 结尾的普通文件并排序；
4. 对 `core` 排除 `/^ai-/`，对 `all` 保留全部，对 `ai` 保留 `/^ai-/`；
5. 对 `live-feed` 和 `skin` 使用明确的文件名集合，并在集合中的文件缺失时抛出错误；
6. 使用 `spawn(process.execPath, ['--test', '--test-force-exit', '--test-concurrency=2', ...extraArgs, ...absoluteTestPaths], { stdio: 'inherit' })`；
7. 子进程正常结束时把其退出码写入 `process.exitCode`，启动错误返回 1；
8. 直接执行脚本时调用 `main(process.argv.slice(2))`，被测试导入时不要启动子进程。

套件名必须只接受 `core`、`all`、`ai`、`live-feed`、`skin`。`npm test -- --test-name-pattern="软跳"` 这类额外参数必须保留并传给 Node 测试运行器。

- [ ] **Step 4：运行调度器单元测试和五个入口的选择性验证**

运行：

```bash
node --test --test-force-exit test/test-runner.test.js
npm test -- --test-name-pattern="不存在的测试名称"
npm run test:live-feed -- --test-name-pattern="实时流（列表）"
npm run test:skin -- --test-name-pattern="软跳仅显示顶部进度线"
npm run test:ai -- --test-name-pattern="不存在的测试名称"
```

预期：调度器测试通过；后三个实际入口返回 0，且不存在的名称只产生 skipped，不启动错误的套件。`npm test` 的空匹配验证不能包含 AI 文件。

- [ ] **Step 5：更新 package scripts 并提交**

将 `package.json` 的 scripts 改为：

```json
"test": "node scripts/run-tests.mjs quick",
"test:quick": "node scripts/run-tests.mjs quick",
"test:core": "node scripts/run-tests.mjs core",
"test:all": "node scripts/run-tests.mjs all",
"test:ai": "node scripts/run-tests.mjs ai",
"test:live-feed": "node scripts/run-tests.mjs live-feed",
"test:skin": "node scripts/run-tests.mjs skin"
```

运行 `node --test --test-force-exit test/test-runner.test.js` 后提交：

```bash
git add package.json scripts/run-tests.mjs test/test-runner.test.js
git commit -m "test: add core and scoped test runners"
```

---

### Task 2：清理 JSDOM 滚动 API 噪声并验证并发边界

**Files:**
- Modify: `test/ai-workbench.test.js` 的 `makeSite`
- Modify: `test/trio.test.js` 的 `makeSite`
- 不修改生产代码

**Interfaces:**
- AI 工作台和未读哨兵的 JSDOM 窗口在插件加载前提供 `w.scrollTo = () => {}`。
- 该模拟不记录滚动位置，也不改变现有滚动断言；只避免 JSDOM 默认的 `Not implemented` stderr 输出。

- [ ] **Step 1：先运行夹具相关测试确认当前噪声**

运行：

```bash
npm run test:ai -- --test-name-pattern="AI 工作台|M3.1"
npm test -- --test-name-pattern="哨兵："
```

预期：行为测试可通过，但输出中能看到由 `refreshShell` 触发的 `Not implemented: window.scrollTo`；如果某条测试出现真实断言失败，先保留失败并按失败堆栈单独复现，不通过删断言解决。

- [ ] **Step 2：补充最小 JSDOM API 模拟**

在两个 `makeSite` 中、第一次加载基座前加入：

```js
w.scrollTo = () => {}
```

不要修改生产代码中的滚动实现，不要把 `scrollTo` 全局写入测试环境。

- [ ] **Step 3：运行夹具专项确认 stderr 干净**

运行同一组命令并检查结果：

```bash
npm run test:ai -- --test-name-pattern="AI 工作台|M3.1"
npm test -- --test-name-pattern="哨兵："
```

预期：相关测试通过，不再出现 `Not implemented: window.scrollTo`；测试数量、断言和插件行为不变。

- [ ] **Step 4：按较低并发复现完整套件的两个历史失败**

运行：

```bash
npm test -- --test-name-pattern="壳内跳转：后退回首页也不 GET /|M3.1 UI：取消 JSON 导入预览不写入状态"
npm run test:all -- --test-name-pattern="壳内跳转：后退回首页也不 GET /|M3.1 UI：取消 JSON 导入预览不写入状态"
```

预期：核心命令不加载 AI 测试；完整命令在 `--test-concurrency=2` 下两个历史用例均通过。若仍失败，只调整对应测试的条件等待，保留行为断言，并先运行单文件复现再提交修复。

- [ ] **Step 5：提交夹具改动**

```bash
git add test/ai-workbench.test.js test/trio.test.js
git commit -m "test: silence jsdom scroll stubs"
```

---

### Task 3：更新开发说明和测试策略

**Files:**
- Modify: `README.md` 的「开发」命令表与「测试策略」
- Modify: `docs/CONVENTIONS.md` 的测试约定

**Interfaces:**
- README 命令说明必须准确区分默认 quick、显式完整非 AI `test:core`、完整 `all`、AI 专项和两个插件专项。
- `docs/CONVENTIONS.md` 必须说明 `npm test` 不含 AI，发布前必须运行 `npm run test:all`。

- [ ] **Step 1：更新 README 命令表**

在现有开发命令块中保留 `npm test`，并补充：

```text
npm test                 # 日常快速回归
npm run test:quick       # 日常快速回归的显式入口
npm run test:core        # 完整非 AI 文件回归
npm run test:all         # 完整回归，包含 AI
npm run test:ai          # 只跑 AI 测试
npm run test:live-feed   # 实时流 + 已读专项回归
npm run test:skin        # skin + skin-canvas 壳回归
```

把原来“`npm test` 即全部源码单元、集成和分发配置测试”的表述改成默认 quick；说明 `test:core` 保留完整非 AI 文件回归，在发布/合并前使用 `test:all`。

- [ ] **Step 2：更新测试策略说明**

在 README 测试策略前增加一段：

```markdown
默认 `npm test` 运行 quick 固定清单；`npm run test:core` 保留完整非 AI 文件回归；AI 测试不会因默认命令自动执行。
修改实时流或已读时优先运行 `npm run test:live-feed`，修改 skin/软跳时优先运行
`npm run test:skin`。发布前使用 `npm run test:all`，再执行构建、产物校验和浏览器冒烟。
```

保留后续各测试文件的职责说明，不把 AI 覆盖描述成默认命令已执行。

- [ ] **Step 3：同步开发规范**

在 `docs/CONVENTIONS.md` 的测试相关位置增加相同边界：默认 quick 使用固定清单，`test:core` 排除 `test/ai-*.test.js` 并保留完整非 AI 文件，`test:all` 是完整回归；新增非 AI 测试会自动进入 `test:core`，新增 AI 测试必须通过 `test:ai` 或 `test:all` 验证。

- [ ] **Step 4：检查文档和差异**

运行：

```bash
git diff --check
```

确认文档没有把 `npm test` 写成包含 AI 的命令，也没有修改与本任务无关的 README 内容。

- [ ] **Step 5：提交文档改动**

```bash
git add README.md docs/CONVENTIONS.md
git commit -m "docs: document core and full test suites"
```

---

### Task 4：运行最终套件并记录覆盖边界

**Files:**
- No new source changes expected.
- If a test is still flaky, modify only its test fixture/wait condition and add the corresponding regression evidence before committing.

- [ ] **Step 1：运行快速专项回归**

```bash
npm run test:live-feed
npm run test:skin
```

预期：实时流/已读 45 个用例全部通过；skin 与 skin-canvas 全部通过。

- [ ] **Step 2：运行默认核心回归**

```bash
npm test
```

预期：输出中不包含 AI 测试文件或 AI 测试名称，退出码为 0。

- [ ] **Step 3：运行 AI 专项回归**

```bash
npm run test:ai
```

预期：只执行 `test/ai-*.test.js`；任何失败都单独记录，不影响 `npm test` 的核心边界。

- [ ] **Step 4：运行完整发布前回归**

```bash
npm run test:all
```

预期：运行所有测试文件，覆盖当前 962 个测试条目（含新增调度器测试）；退出码为 0。不得通过隐藏失败、减少文件集合或删除断言来满足结果。

- [ ] **Step 5：完成差异检查**

```bash
git diff --check
npm test
```

确认最终改动只涉及 `package.json`、`scripts/run-tests.mjs`、测试夹具、`test/test-runner.test.js`、README、`docs/CONVENTIONS.md` 及本计划/设计文档；不覆盖用户已有的其他工作区改动。
