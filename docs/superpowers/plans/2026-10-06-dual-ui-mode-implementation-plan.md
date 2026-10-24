# 双 UI 模式实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在皮肤插件中提供旧固定三段式与 iOS 27 单画布两种全站 UI，缺少或无效模式配置时默认显示旧三段式。

**Architecture:** `plugins/skin.user.js` 负责读取和归一化 `uiMode`、选择挂载路径，以及在模式变化时清理并恢复被移动的原生节点。`src/shell-boot.js` 只为显式选择 iOS 27 的页面预先绘制 document-start 占位；旧模式使用原生页面直到皮肤插件挂载三栏壳。单画布的外观和媒体数据继续留在现有 `canvas-state:v2`，不随模式切换迁移或删除。

**Tech Stack:** Userscript JavaScript、插件配置表单、Node.js `node:test`、JSDOM、Playwright 浏览器烟测、现有 build 与 dist 校验脚本。

**Spec:** `docs/superpowers/specs/2026-10-06-dual-ui-mode-design.md`

## Global Constraints

- `uiMode` 的有效值只有 `legacy` 与 `ios27`；运行时仅在值严格等于 `ios27` 时挂单画布，缺失、空值及未知值都归一为 `legacy`。
- 皮肤插件的 `shell` 总开关继续独立生效；`shell: false` 时移除两种氢壳 UI 并恢复站点原生页面。
- 旧模式是固定左导航 / 中间正文 / 右信息栏，不创建窗口拖动控制；旧 `layoutMode` 或窗口布局存储不能改变此行为。
- 旧模式在宽度 `>=1100px` 显示完整三栏；低于 `1100px` 不挂固定壳并恢复站点原生响应式布局，窄屏也不启用会覆盖原生布局的 shell 状态类。
- 配置切换不刷新页面；切换前后保留当前 URL、原正文节点身份和页面滚动位置。每次只能存在一个有效壳。
- 卸载展示层时移除该层拥有的事件监听、观察器、定时器和滚动桥，并恢复被移动的搜索框、主题按钮、个人资料卡、侧栏卡片及其它原生节点。挂载失败时显示原生页面。
- 模式切换不得清除或重置 `canvas-state:v2`、画布外观或媒体配置；不得改变路由、帖子正文、AI、网络请求或站内写操作流程。
- 保留工作区中已存在的未提交改动；不运行重置或宽泛暂存命令。执行前检查目标文件的既有差异，构建只在完成源码与测试修改后运行。
- 基座改动后基座版本为 `0.2.2`；皮肤、套件中心、套件 banner 与由套件版本派生的 LTS 产物为 `2.0.22`。皮肤依赖下限同步改为 `^0.2.2`。

---

## 文件结构

- `plugins/skin.user.js`：新增 manifest 配置选择器与 `effectiveUiMode()`；在旧三栏与画布之间分流；控制响应式断点、DOM 生命周期及模式切换后的恢复。
- `src/shell-boot.js`：把 document-start 画布占位限定为显式 `uiMode: 'ios27'`，保留皮肤停用与 `shell: false` 的既有保护。
- `test/skin.test.js`：验证默认/无效模式、配置选择器、旧模式挂载、双向切换、失败恢复及 boot 占位决策。
- `test/skin-canvas.test.js`：将画布专属测试夹具显式配置为 `ios27`，维持当前画布功能的回归覆盖。
- `scripts/check-skin-browser.mjs`：运行真实浏览器双模式验收，覆盖固定三栏、窄屏原生回退和现有 iOS 27 行为。
- `scripts/ios27-canvas-smoke.mjs`：在注入基座和皮肤前显式写入 `uiMode: 'ios27'`，确保该烟测始终验证单画布。
- `test/fixtures/cloudflare-challenge.html`：提供包含 Cloudflare 整页挑战标记、可见验证提示及 `main.wrap` 的共享夹具，供 Node 与 Playwright 验收。
- `src/core.js`、`package.json`、`package-lock.json`、`build-suite.mjs`、`suite/suite-center.js`、`test/suite.test.js`：同步基座和套件版本契约。
- `dist/linuxsb-base.user.js`、`dist/linuxsb-suite.user.js`、`dist/linuxsb-lts.user.js`：最终由 `npm run build` 生成；不得手工复制源码片段到产物。

## 实施任务

### Task 1：先补模式契约测试并固定 iOS 27 回归夹具

**Files:**
- Modify: `test/skin.test.js`
- Modify: `test/skin-canvas.test.js`

**Interfaces:**
- 测试夹具提供 `withSkinConfig(preload, patch)`，用于在不覆盖其它预载配置的前提下设置 `lsb_base:skin:__config`。
- `test/skin-canvas.test.js` 的既有画布测试显式选择 `uiMode: 'ios27'`；新默认测试使用完全缺少 `uiMode` 的配置。

- [x] **Step 1: 添加缺省、未知值与显式 iOS 27 的失败测试**

  在 `test/skin.test.js` 新增测试，分别以缺少 `uiMode`、`uiMode: ''`、`uiMode: 'future-mode'` 启动皮肤，并断言根节点没有 `lsb-canvas-mode`、文档没有 `#lsb-shell-surfaces`，且宽屏会创建旧壳。另以 `uiMode: 'ios27'` 启动并断言存在 `#lsb-shell[data-lsb-canvas-shell="true"]` 和画布 surfaces。

  ```js
  test('界面模式缺失或未知时使用旧三段式', async () => {
    for (const uiMode of [undefined, '', 'future-mode']) {
      const config = uiMode === undefined ? {} : { uiMode }
      const { w } = makeHome({ 'lsb_base:skin:__config': config })
      await loadBase(w, PLUG('skin.user.js'))
      assert.equal(w.document.documentElement.classList.contains('lsb-canvas-mode'), false)
      assert.equal(w.document.getElementById('lsb-shell-surfaces'), null)
      assert.ok(w.document.getElementById('lsb-shell'))
    }
  })
  ```

- [x] **Step 2: 运行新测试确认当前实现失败**

  运行：`node --test --test-name-pattern="界面模式缺失或未知|显式 iOS 27" test/skin.test.js`

  预期：缺省值用例失败，当前皮肤仍无条件添加画布标记并挂载单画布。

- [x] **Step 3: 增加显式模式的画布测试夹具**

  在 `test/skin-canvas.test.js` 的 `makeDom()` 预载配置中合并 `uiMode: 'ios27'`，并允许单独的测试明确传入“无 `uiMode`”配置。把 `test/skin.test.js` 中依赖 `#lsb-shell-surfaces`、画布标记、画布状态、软跳或 iOS 27 boot 的既有烟测调用改用显式 `uiMode: 'ios27'` 的夹具；旧壳行为测试和新默认测试不得被该夹具隐式改成 iOS 27。

- [x] **Step 4: 运行画布回归测试确认夹具仍覆盖原行为**

  运行：`node --test test/skin-canvas.test.js`

  预期：在实现模式分流前，既有画布断言仍继续运行并通过；若当前工作区 dist 尚未更新，则先按后续 Task 4 的步骤重建基座，再判定 boot 相关测试结果。

### Task 2：实现配置归一化、固定三栏分流和响应式旧壳

**Files:**
- Modify: `plugins/skin.user.js`
- Modify: `test/skin.test.js`

**Interfaces:**
- `effectiveUiMode()` 返回 `'ios27'` 或 `'legacy'`；仅 `cfg.uiMode === 'ios27'` 返回 `'ios27'`。
- `applyMarkers()`、`css()`、`refreshShell()` 与所有首次挂载/路由更新入口使用同一有效模式判断。
- `shellWindowEnabled()` 在本功能的旧模式路径返回 `false`，旧 `layoutMode` 和历史窗口布局不参与三栏呈现。

- [x] **Step 1: 添加设置表单与旧模式结构断言**

  在 `test/skin.test.js` 验证皮肤插件设置表单出现“界面模式”选择器，选项值为 `legacy` / `ios27`，显示文字为“旧三段式” / “iOS 27 单画布”，默认值为 `legacy`。对宽度 `1100` 与 `1099` 分别创建无模式配置，断言前者挂载旧壳且不含 canvas surfaces，后者不挂固定壳并保留原生顶栏、侧栏。

- [x] **Step 2: 运行设置与结构测试确认失败**

  运行：`node --test --test-name-pattern="界面模式缺失或未知|界面模式设置|旧三栏断点" test/skin.test.js`

  预期：新配置项和旧模式路由断言失败。

- [x] **Step 3: 增加 manifest 选择器和唯一有效模式函数**

  在 `plugins/skin.user.js` 的 `manifest.config` 增加：

  ```js
  uiMode: {
    type: 'select',
    label: '界面模式',
    default: 'legacy',
    options: [
      { value: 'legacy', label: '旧三段式' },
      { value: 'ios27', label: 'iOS 27 单画布' },
    ],
  },
  ```

  在 setup 内实现 `effectiveUiMode()`，将缺失、空值及未知值统一归一为 `legacy`：

  ```js
  function effectiveUiMode() {
    return cfg?.uiMode === 'ios27' ? 'ios27' : 'legacy'
  }
  ```

  保留 `shell` 开关，并将其描述从只指单一画布改成覆盖两种氢壳模式。

- [x] **Step 4: 按有效模式调整标记、CSS 与壳挂载**

  在 `css()` 中只为显式 iOS 27 生成 `canvasCss()`；旧模式保留旧三栏 CSS，但窄屏时不启用 shell 状态类。更新 `refreshShell()`：`shell: false` 继续完整 teardown；显式 iOS 27 调用现有 `mountCanvas()`；旧模式仅在 `asideWide()` 为真时运行 `ensureShell()` / `fillShell()`，窄屏不创建固定三栏壳并撤销旧壳隐藏状态。

  在 `fillShell()` 旧壳路径保持当前 header、rail、正文与 aside 的节点来源和填充逻辑，并确保 `shellWindowEnabled()` 对旧模式返回 `false`。将窄屏断点设为宽度 `>=1100` 才显示旧三栏，低于该宽度保留原生 header、sidebars、左导航和正文布局。

- [x] **Step 5: 运行配置与模式路由测试**

  运行：`node --test --test-name-pattern="界面模式缺失或未知|显式 iOS 27|界面模式设置|旧三栏断点" test/skin.test.js`

  预期：模式归一化、配置选项、宽屏旧壳与显式 canvas 选择全部通过；画布专属测试仍须通过 `uiMode: 'ios27'` 进入原逻辑。

### Task 3：实现无需刷新的双向切换、清理和失败回退

**Files:**
- Modify: `plugins/skin.user.js`
- Modify: `test/skin.test.js`

**Interfaces:**
- `refreshShell()` 区分“当前已挂载模式”与“目标模式”，同模式路由刷新不重复拆装展示层。
- `bindUiModeResize()` / `unbindUiModeResize()` 只在 `asideWide()` 的布尔值跨过 `1100px` 断点时触发壳刷新，并在 teardown 时移除监听。
- 模式变化先卸载当前展示层并恢复 DOM，再挂载目标模式；返回或记录挂载结果，以便失败时清理标记并恢复原生页面。
- 保存选择后继续通过现有 `config:changed:skin` 事件同步，无需整页导航。

- [x] **Step 1: 编写节点身份、路由与滚动保持测试**

  在测试中记录滚动位置，先以默认旧模式加载，再保存 `uiMode: 'ios27'` 并发出既有 `config:changed:skin` 事件，等待刷新后反向切回 `legacy`。每次断言 URL 未变、同一 `main.wrap` 仍连接、每种原生节点只存在一份，恢复后节点回到原父节点，且滚动坐标未改变；额外连续切换三轮并确认始终最多一个 `#lsb-shell`、一个 canvas surface host。另把视口从 `1100px` 改为 `1099px` 再改回 `1100px`，断言旧壳在每次断点跨越后卸载/挂载且原生节点没有丢失。

- [x] **Step 2: 运行切换测试确认失败**

  运行：`node --test --test-name-pattern="界面模式双向切换|连续切换恢复原生节点" test/skin.test.js`

  预期：当前代码会继续走单画布路径或重复执行挂载，无法通过模式、节点或壳数量断言。

- [x] **Step 3: 实现互斥的展示层卸载与挂载**

  在 `refreshShell()` 中读取切换前 `window.scrollX`、`window.scrollY`；当目标模式与当前挂载模式不一致时，先解除当前模式的事件、观察器、定时器及滚动桥，再调用既有恢复函数归还搜索框、主题按钮、资料卡、aside 卡片和正文出口，移除旧展示层拥有的 DOM 与根节点标记。之后挂载目标模式、恢复原坐标，并把当前模式记为已挂载。

  同模式路由更新只同步当前壳内容，不得调用会清除 `viewCache` 或改变页面正文身份的完整停用流程。仅在窗口宽度跨过 `1100px` 时让 `bindUiModeResize()` 调用 `scheduleRefresh(false)`；`unbindUiModeResize()` 在 `teardownShell()` 中移除同一监听器。窗口拖动 chrome 不得在旧模式创建；模式切换不得写入或删除 `canvas-state:v2`。

- [x] **Step 4: 添加挂载失败时回到原生页面的测试与保护**

  在测试中移除当前 route outlet 后触发切到 iOS 27，断言 `lsb-canvas-mode`、canvas 占位与壳隐藏类都被清掉，原生顶栏和侧栏的隐藏标记被移除，且没有抛出未处理异常。实现中检查 `mountCanvas()` / `fillShell()` 是否成功；目标层未挂载成功时清理部分创建的 surface、隐藏状态和活动模式记录，调用原生恢复路径。

- [x] **Step 5: 运行生命周期回归测试**

  运行：`node --test --test-name-pattern="界面模式双向切换|连续切换恢复原生节点|挂载失败恢复原生页面|皮肤停用" test/skin.test.js`

  预期：两种模式切换、反复切换、节点复原、失败回退与原停用流程均通过。

### Task 4：让 document-start 占位只服务于显式 iOS 27

**Files:**
- Modify: `src/shell-boot.js`
- Modify: `test/skin.test.js`

**Interfaces:**
- `shouldShellBoot()` 只有在皮肤未停用、`shell !== false` 且存储配置中的 `uiMode === 'ios27'` 时返回 `true`。
- base-only boot 测试通过重建后的 `dist/linuxsb-base.user.js` 执行实际打包入口，确保测试验证与用户安装代码一致。

- [x] **Step 1: 添加 document-start 模式矩阵测试**

  为 `test/skin.test.js` 的壳占位测试增加以下输入：无 skin config、空 config、未知 `uiMode`、显式 `legacy`、显式 `ios27`、`ios27 + shell:false`、皮肤停用。断言只有显式 iOS 27 且皮肤和 shell 均启用时会创建 `lsb-canvas-boot`、boot frame 与占位 CSS。原有“单画布占位”与“画布接管”测试的预载配置明确加上 `uiMode: 'ios27'`。

- [x] **Step 2: 运行旧 dist 上的模式矩阵，确认缺省用例失败**

  运行：`node --test --test-name-pattern="壳占位：仅基座|壳占位：配置缺少模式|壳占位：显式 iOS 27" test/skin.test.js`

  预期：缺省和 legacy 用例失败，因为现有基座对所有开启皮肤的页面都会添加单画布占位。

- [x] **Step 3: 将 boot 判定收紧为显式 iOS 27**

  在 `src/shell-boot.js` 的 `shouldShellBoot()` 中读取 `rawGet('lsb_base:skin:__config')`，并在现有停用及 `shell:false` 判断后增加：`if (cfg?.uiMode !== 'ios27') return false`。保留 navigation guard 对显式画布页的现有工作、视频 URL 校验及 `plugin:activated` / `config:changed:skin` 的同步逻辑。

- [x] **Step 4: 重新构建基座并验证 boot 测试**

  运行：`npm run build`，再运行：`node --test --test-name-pattern="壳占位" test/skin.test.js`

  预期：缺省与旧模式保持原生首屏，显式 iOS 27 继续出现占位并在真实画布接管后正确清除。

### Task 5：扩展真实浏览器双模式验收并固定 iOS 27 烟测目标

**Files:**
- Modify: `scripts/check-skin-browser.mjs`
- Modify: `scripts/ios27-canvas-smoke.mjs`
- Modify: `test/skin.test.js`（如补充浏览器对应的窄屏结构契约）

**Interfaces:**
- 浏览器验收在装载 base/skin 前写入该轮测试的 `uiMode`，同一 fixture 可分别执行 `legacy` 和 `ios27`。
- iOS 27 smoke 的每个页面上下文均在注入 base 与 skin 前显式保存 `uiMode: 'ios27'`；`topicSpa` 等现有测试配置与此合并。

- [x] **Step 1: 扩展浏览器验收为双模式循环**

  修改 `scripts/check-skin-browser.mjs`，在注入 base 与 skin 前设置 localStorage 的 skin config，并分别运行 `legacy` 与 `ios27`。旧模式在 `1440px` 和 `1100px` 检查 header、左 rail、中间正文、右 aside 均显示且区域不重叠；断言无 canvas surfaces、无 `lsb-canvas-mode`、无 window drag chrome。旧模式在 `1099px`、`700px`、`699px` 检查 shell 不显示或不存在、原生 header / sidebars 显示、正文可交互且无横向溢出。iOS 27 模式继续运行现有五档宽度与 surface、导航点击、AI card 拖动检查。

- [x] **Step 2: 设置真实首页和帖子页覆盖**

  将浏览器验收 fixture 覆盖扩展到首页和帖子页；两模式至少各跑一次宽屏和窄屏，旧模式另检查 `1100px` 断点。采集 computed style 与 bounding boxes，不以 DOM 存在代替可见性断言；控制台错误或正文水平溢出时让脚本以非零退出码失败。

- [x] **Step 3: 运行浏览器验收确认缺少旧模式分支时失败**

  运行：`node scripts/check-skin-browser.mjs`

  预期：先在 legacy 场景暴露错误 canvas surfaces、三栏显示或窄屏隐藏断言；依 Task 2 修正实现后该命令所有模式和宽度均通过。Playwright 未安装时沿用当前脚本报告 `SKIP` 并以退出码 0 结束的行为。

- [x] **Step 4: 让 iOS 27 smoke 显式设定测试模式**

  在 `scripts/ios27-canvas-smoke.mjs` 新增 helper，在每个页面注入 base / skin 之前合并写入 `{ uiMode: 'ios27' }`；保留页面已有的 `topicSpa`、迁移标记及 canvas state，不以整个配置对象替换其余属性。

- [x] **Step 5: 运行 iOS 27 smoke 并检查测试对象**

  运行：`npm run smoke:ios27`

  预期：原有首页、用户页、帖子软跳、画布外观和媒体场景仍运行于 iOS 27；结果不依赖新默认值。

### Task 6：同步版本、生成产物并完成全量验证

**Files:**
- Modify: `src/core.js`、`package.json`、`package-lock.json`
- Modify: `plugins/skin.user.js`、`build-suite.mjs`、`suite/suite-center.js`
- Modify: `test/skin.test.js`、`test/suite.test.js`
- Generate: `dist/linuxsb-base.user.js`、`dist/linuxsb-suite.user.js`、`dist/linuxsb-lts.user.js`

**Interfaces:**
- base 的 `src/core.js`、package 文件与 base userscript header 版本一致为 `0.2.2`。
- skin userscript header / manifest 版本一致为 `2.0.22`，依赖范围为 `^0.2.2`。
- `build-suite.mjs` 与 `suite/suite-center.js` 的 suite 版本为 `2.0.22`；LTS banner 由套件版本派生。

- [x] **Step 1: 添加版本同步断言**

  更新 `test/suite.test.js` 对基座、套件与 LTS 版本的硬编码断言至 `0.2.2` / `2.0.22`，并在 `test/skin.test.js` 更新皮肤最低基座版本断言。先运行版本相关测试，确认它们会因源码仍是旧版本而失败。

- [x] **Step 2: 同步源码版本及插件依赖**

  将 `src/core.js`、`package.json`、`package-lock.json` 的根项目版本改为 `0.2.2`；将 skin header 和 manifest 改为 `2.0.22`、requires 改为 `^0.2.2`；将 `build-suite.mjs` 与 `suite/suite-center.js` 的套件版本更新为 `2.0.22`。只改对应版本字段，不覆盖这些已有修改文件中的其它工作区改动。

- [x] **Step 3: 重建所有分发产物**

  运行：`npm run build`

  预期：base、suite、LTS 产物均从当前源码生成，base header 为 `0.2.2`，suite 和 LTS header 为 `2.0.22`，套件中 skin 版本为 `2.0.22` 且 `shell-boot` 已包含新判定。

- [x] **Step 4: 运行全量 Node 测试和产物校验**

  运行：`npm test`，然后运行：`npm run verify:dist`。

  预期：全量测试通过，base / suite / LTS 产物新鲜，skin header 与 manifest、套件 banner 与 suite center 版本对齐。

- [x] **Step 5: 运行两项浏览器验收和差异卫生检查**

  运行：`node scripts/check-skin-browser.mjs`、`npm run smoke:ios27`、`git diff --check`。

  预期：legacy / iOS 27 双模式浏览器验收通过；iOS 27 烟测明确使用其目标模式；差异没有空白错误。检查 `git status --short` 与目标文件 diff，确认只报告预期路径，不清理、不重置、不宽泛暂存预先存在的更改。

  实际检查说明：默认 `git diff --check` 将工作区中既有 CRLF 行尾的回车符报告为尾随空白；使用 `git -c core.whitespace=cr-at-eol diff --check` 检查后无输出。为保留原有工作区内容，本次未批量改写这些文件的行尾。

### Task 7：旧三栏顶栏固定品牌，并排除 AI 操作台入口

**Files:**
- Modify: `test/skin.test.js`
- Modify: `plugins/skin.user.js`

**Interfaces:**
- 旧三栏品牌文字固定为 `LINUX SB`，Logo 仍优先取原站品牌链接里的图片；停用皮肤后原站品牌节点保持不变。
- `collectTopExtras()`、缓存回放与快照共用 `isAiConsoleExtra(node, href, label)` 判定；实时 `.lsb-ai-console-top` 与旧缓存中标签含“AI 操作台”的入口不得进入旧壳顶栏。
- 其它站点和插件入口仍由当前收集、缓存与恢复逻辑处理；不禁用 AI 插件或改变 iOS 27 AI 卡片。

- [x] **Step 1: 添加旧壳品牌与实时/缓存入口的失败测试**

  在 `test/skin.test.js` 增加一项显式 `uiMode: 'legacy'` 的测试。把原站 `a.brand` 改为包含 `img[src="/assets/site-logo.svg"]`、文字 `宣传标语` 的结构；在原站顶栏加入 `.lsb-ai-console-top`、另一个普通 `.plugin-top-menu-link`，并在 `lsb_base:skin:topExtras` 预载 `{ href: '/ai-console', label: '✨ AI 操作台' }` 与 `{ href: '/invite', label: '邀请中心' }`。挂载后断言壳品牌图片仍为 `/assets/site-logo.svg`、图片外可见文字仅为 `LINUX SB`，壳顶栏没有实时或缓存的 AI 操作台链接，普通插件入口和邀请中心仍在；实时 AI 链接仍留在原站顶栏。停用皮肤后，原站品牌与 AI 链接仍在原父节点。

- [x] **Step 2: 运行新测试确认当前实现失败**

  运行：`node --test --test-force-exit --test-name-pattern="旧三栏品牌区固定站名并过滤 AI 操作台" test/skin.test.js`

  预期：品牌文字包含原站宣传语，实时及缓存的 AI 操作台链接会被旧顶栏接收。

- [x] **Step 3: 固定壳品牌并过滤实时和持久化 AI 操作台链接**

  在 `plugins/skin.user.js` 中保留现有原站 Logo 查找与 fallback，只将旧壳 `brandName` 固定为 `LINUX SB`。新增 `isAiConsoleExtra(node, href, label)`：节点具有 `.lsb-ai-console-top`，或归一化标签含 `AI 操作台` 时返回真。实时采集、壳内已有入口清理、缓存 hydrate 与缓存 snapshot 均调用该判定；普通插件入口继续按原顺序迁入并停用时复原。不得把 `.lsb-ai-copilot-top` 或 iOS 27 入口一并移除。

- [x] **Step 4: 运行品牌与顶栏回归测试**

  运行：`node --test --test-force-exit --test-name-pattern="旧三栏品牌区固定站名并过滤 AI 操作台|AI 操作台不出现在底部工具胶囊或更多工具|帖子页顶部状态栏不显示 AI 专用快捷入口" test/skin.test.js test/skin-canvas.test.js`

  预期：旧三栏只显示 Logo 与固定站名，不迁入 AI 操作台；普通旧入口与现有单画布 AI 入口行为保持原样。

### Task 8：Cloudflare 整页挑战时双层 fail-open 并在验证后恢复

**Files:**
- Create: `test/fixtures/cloudflare-challenge.html`
- Modify: `src/shell-boot.js`
- Modify: `plugins/skin.user.js`
- Modify: `test/skin.test.js`

**Interfaces:**
- 基座挑战检测只在 Cloudflare 挑战 DOM 标记与可见挑战标题/验证文案同时存在时为真；单独的 Cloudflare 资源、`.cf-turnstile` 或 Turnstile iframe 不构成挑战页。
- 基座在根节点写入 `data-lsb-cloudflare-challenge="true"` 表示挑战状态；进入挑战时仅撤掉不透明 boot class/frame，保留导航守卫样式与监听。挑战消失后重新评估 boot 状态。
- 皮肤刷新先检查挑战状态；挑战期间不查找/接管 `main` 或 `main.wrap`，已有展示层则完整卸载并恢复被移动节点。皮肤监听挑战状态变化，挑战消失后触发一次正常刷新并恢复当前明确选择的 UI 模式。
- 不修改、阻止或模拟 Cloudflare 验证脚本、验证控件及网络请求。

- [x] **Step 1: 新增高置信度挑战夹具和 Node 行为测试**

  创建 `test/fixtures/cloudflare-challenge.html`，包含标题 `Just a moment...`、`#challenge-stage` 标记、可见标题 `Verify you are human`、原生顶栏/侧栏，以及一个 `main.wrap` 挑战正文。`test/skin.test.js` 读取此夹具并以 `uiMode: 'ios27'` 启动：基座加载后断言根节点被标记为挑战、没有 `lsb-canvas-boot` 与 boot frame；加载皮肤后断言无 shell、surface、`lsb-canvas-mode`，挑战正文和 `main` 节点身份未变，原生顶栏/侧栏未被隐藏。再移除挑战标记、把标题改成普通论坛标题、将同一 `main` 节点改为论坛正文，断言画布在同一文档恢复。另在正常论坛夹具中仅加入 Cloudflare 脚本 URL、`.cf-turnstile` 和验证 iframe，断言仍按 iOS 27 挂载画布且不带挑战状态标记。

- [x] **Step 2: 运行挑战和 Turnstile 测试确认当前实现失败**

  运行：`node --test --test-force-exit --test-name-pattern="Cloudflare 整页挑战|普通 Turnstile" test/skin.test.js`

  预期：当前 boot 会保留不透明占位，皮肤可能把挑战页的 `main.wrap` 当作论坛正文挂载；普通 Turnstile 用例用于锁定不能因资源或小组件误触发旁路的边界。

- [x] **Step 3: 在 document-start 基座层识别挑战并释放首屏占位**

  在 `src/shell-boot.js` 增加高置信度检测：要求至少一个 Cloudflare 整页挑战标记（覆盖 `#challenge-stage`、`#challenge-form`、`#challenge-running`、`#cf-challenge-running`、`.cf-browser-verification`）和可见的挑战标题或正文验证文案（覆盖 `Just a moment`、`Checking your browser`、`Verify you are human`、`Enable JavaScript and cookies to continue` 及明确的中文验证文案）。不以 hostname、Cloudflare 资源、`cf-turnstile` 类名或 iframe 单独判定。

  用 `MutationObserver` 监听挑战标记从迟到注入到验证消失；挑战出现时设置 `data-lsb-cloudflare-challenge="true"`、移除 `lsb-canvas-boot` 与 boot frame，但保留含 `.lsb-canvas-navigating` 规则的样式和导航守卫。挑战消失时清除挑战标记并重新应用显式 iOS 27 boot 判定；配置关闭或皮肤停用时，仍走现有完整清理。

- [x] **Step 4: 让皮肤挑战期间 fail-open，状态恢复后刷新画布**

  在 `plugins/skin.user.js` 的 `refreshShell()` 最前面检查基座挑战标记：如果挑战存在，解除 SPA/首页滚动绑定，调用现有完整卸载与原生节点归还流程，但保留挑战期 boot 样式表以供导航守卫继续工作；不向挑战 DOM 添加 shell/canvas 标记。监听 `data-lsb-cloudflare-challenge` 变化：状态进入挑战时安排刷新卸载，状态离开挑战时安排一次常规刷新。使 `findRouteOutlet()` 在挑战状态下返回 `null`，作为其它调用点的第二道保护。不能在 Cloudflare 仍挑战时反复重新创建画布或首屏遮罩。

- [x] **Step 5: 构建并运行挑战行为测试**

  运行：`npm run build`，然后运行：`node --test --test-force-exit --test-name-pattern="Cloudflare 整页挑战|普通 Turnstile" test/skin.test.js`。

  预期：整页挑战始终显示原生验证页面，验证消失后同一文档恢复显式 iOS 27 画布；正常页面中的 Turnstile 控件不会触发旁路。boot 导航守卫 CSS 在挑战页仍可用。

### Task 9：扩展 Playwright 浏览器烟测覆盖挑战页与恢复

**Files:**
- Modify: `scripts/check-skin-browser.mjs`
- Use: `test/fixtures/cloudflare-challenge.html`

**Interfaces:**
- 浏览器验收新增 iOS 27 Cloudflare 整页挑战场景，并在同一页面模拟挑战节点被论坛内容替换；验收数据通过实际 DOM/class/可见性断言采集。
- 现有 legacy 与 iOS 27 首页、帖子页及宽度矩阵不删减。

- [x] **Step 1: 添加挑战页真实浏览器场景**

  在脚本读取共享挑战夹具，并为 `page=challenge` 注入与现有 iOS 27 场景相同的 base/skin 配置。浏览器断言挑战期间 challenge 内容可见、挑战 `main` 身份保留、无 shell/surfaces/canvas 标记/boot frame，且页面没有横向溢出。然后在同一文档删除挑战标记、改为论坛标题并把原 `main` 改为普通论坛正文，等待画布 surfaces 出现，断言 `lsb-canvas-mode` 已恢复且挑战标记已清除。给正常 iOS 27 页面注入普通 `.cf-turnstile` 控件后，断言它不触发挑战旁路。

- [x] **Step 2: 运行浏览器验收**

  运行：`node scripts/check-skin-browser.mjs`

  预期：原有两种模式宽度矩阵与新增挑战/恢复场景通过；如果 Playwright 未安装，遵循脚本现有 `SKIP` 行为并以退出码 0 结束。

### Task 10：重建发行文件并完成回归验证

**Files:**
- Generate: `dist/linuxsb-base.user.js`
- Generate: `dist/linuxsb-suite.user.js`
- Generate: `dist/linuxsb-lts.user.js`

**Interfaces:**
- 三份产物只由现有 build 命令从源码生成；其中基座包含挑战观察器，套件皮肤包含品牌过滤与皮肤层 fail-open。

- [x] **Step 1: 运行完整测试与发行产物校验**

  运行：`npm test`，然后运行：`npm run verify:dist`。

  预期：Node 全量测试通过，base/suite/LTS 与源码保持新鲜，皮肤版本和套件版本仍与已完成 Task 6 的版本契约一致。

- [x] **Step 2: 检查 CRLF-aware 差异和目标文件范围**

  运行：`git -c core.whitespace=cr-at-eol diff --check`，并检查 `git status --short` 与上述源码、测试、脚本、夹具及 dist 文件的 diff。

  预期：CRLF-aware 空白检查无错误；只保留本次预期增量和既有工作区差异，不运行重置或宽泛暂存命令。

## 规格覆盖自审

- 缺省与未知配置回到旧模式、显式 `ios27` 选择单画布、皮肤总开关独立：Task 1–2。
- 旧版固定三栏、禁用拖动窗口、`1100px` 断点与原生响应式回退：Task 2、Task 5。
- 双向即时切换、保留 URL / 正文节点 / 滚动、恢复移动节点、清理重复挂载和失败时恢复原生页：Task 3。
- `canvas-state:v2` 与 iOS 27 外观 / 媒体数据保留：Global Constraints、Task 3。
- document-start 只为显式 iOS 27 画占位，停用与关壳继续受保护：Task 4。
- 画布/软跳回归明确固定 `ios27`，浏览器两模式和版本产物通过验收：Task 1、Task 5–6。
- 旧三栏品牌固定为 Logo + `LINUX SB`，实时及缓存 AI 操作台入口均排除且其它入口保留：Task 7。
- Cloudflare 整页挑战的高置信度识别、首屏与皮肤双层 fail-open、导航守卫样式保留、同文档验证恢复及 Turnstile 不误判：Task 8–9。
- 路由、AI、网络与站内写操作安全流程不变：Global Constraints；Cloudflare 验证本身不被修改。

### 补充任务自审

- 规格覆盖：品牌名称、Logo、实时和缓存入口筛除与原生恢复均由 Task 7 覆盖；挑战标记与可见验证文案联合识别、boot 层释放遮罩、skin 层卸载/恢复、挑战消失后重挂载、Turnstile 负例与浏览器验收由 Task 8–9 覆盖；产物生成和全量验证由 Task 10 覆盖。
- 占位扫描：新增步骤均给出目标文件、具体输入 DOM、断言、命令与期望结果；无 TBD/TODO/“稍后实现”等未决步骤。
- 接口一致性：boot 层统一使用 `data-lsb-cloudflare-challenge="true"` 作为挑战状态；Task 8 Node 测试与 Task 9 浏览器测试都观察相同标记；皮肤刷新和路由出口按同一标记旁路。
- 范围检查：只改旧壳品牌/入口过滤、document-start 占位检测和皮肤接管保护，不改验证流程、请求、AI 工作流或通用路由行为。
