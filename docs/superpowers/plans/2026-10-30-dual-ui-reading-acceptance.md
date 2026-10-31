# 双界面阅读验收

> 2026-10-30。验收当前工作区的 `legacy` 与 `ios27`，保留既有未提交改动。测试和文档调整不升产品版本；仅在回归证明真实行为缺陷时修改生产代码并同步版本。

## 目标与边界

阅读路径为首页 → 帖子 → 返回首页，包含连续跳转、延迟响应、输入回复、切换界面、停用及恢复原生节点。旧版可拖动窗口不是当前产品契约。浏览器验收使用离线站点快照和真实 Chromium；不向线上站点提交操作，也不等同于油猴安装验收。

## 执行清单

- [x] 记录开发版、正式版构建和完整 Node 测试基线。
- [x] 审计 `test/skin.test.js` 的 52 个跳过项，记录每项恢复、替代或废弃理由；同步 `scripts/check-test-skips.mjs`。
- [x] 在现有测试或独立阅读专项中，对两种模式验证路由、原生节点、迟到响应、输入与停用后的行为，使用可控网络响应而非源码字符串断言。
- [x] 增加两种宽屏界面、触屏视口和同一浏览器上下文多标签的浏览器验收；失败时保存截图与 trace。
- [x] 将新增用例接入已有专项、完整测试及浏览器冒烟命令，更新当前文档。
- [x] 运行相关专项、产物校验、跳过预算、完整 Node 回归和所有浏览器冒烟，核对相对于本轮基线的文件变更。

## 预期文件与验证

- `test/skin.test.js`：迁移旧 skip 与双模式路由隔离回归。
- `test/reading-acceptance.test.js`（按需）：输入、切换与生命周期专项，使用真实插件与 fixture。
- `scripts/reading-browser-smoke.mjs`：真实布局、滚动、触屏和多标签验收。
- `scripts/run-tests.mjs`、`package.json`：验收入口。
- `docs/reading-acceptance.md`：验收范围、旧测试处置与已知边界。

执行命令：`npm run test:skin`、`npm run verify:profiles`、`npm run verify:test-skips`、`npm run test:all`、`npm run smoke:browser`。涉及生产代码时先补失败回归，再作最小修复，重建两种产物后复验。

## 执行结果

- 开发与正式构建完成；产物 profile、跳过预算及本轮变更的空白检查通过。
- 52 项旧跳过中恢复 34 项、归并或废弃 18 项，逐项映射见 [验收记录](../../reading-acceptance.md)。
- 完整 Node 回归最终为 **1015 通过、0 失败、0 跳过**；包含完整 skin 专项。
- `smoke:browser` 的旧版、单画布和阅读场景全部通过。调整阅读夹具的最小布局 CSS 后，`smoke:reading` 再次通过全部 5 个场景。
- 发现并修复 ios27 首次挂载未绑定首页无限滚动；对应 Node 与 Chromium 用例均经历修复前失败、修复后通过。
- 本轮未修改既有基座优化或合成规划实现。产物中包含工作区原有改动，未创建提交。

本地证据：`artifacts/reading-acceptance/node-tests.log`、`results.json` 及两种触屏截图。
