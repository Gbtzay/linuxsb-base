# skin 子模块

`skin` 是 8200+ 行的复合插件，侧车按 setup 内七区（A–G）与十六小节落地为可复用的独立编辑单元。

- `0-manifest.js` — 头与 manifest/config（约 60 行，含 userscript 头）
- `0-canvas-pure.js` — 画布状态纯函数与常量（约 178 行）
- `A-canvas-viewport.js` — 由 A 起的视图与读取缓存等
- `B1`–`B4` — 旧三段式与单画布样式等
- `C1`/`C2` — 媒体与背景
- `D1`–`D3` — 原生结构接管
- `E1`–`E3` — 侧栏与氢壳视图
- `F1`/`F2` — 插件特性与工具菜单
- `G1`–`G3` — 导航、搜索及 M17 画布（约 2394/3280 行）
- `Z-footer.js` — setup 收尾与 LSB 注册

### 侧车使用说明

- 侧车仅作编辑与审查单元，`build-suite.mjs` 不聚合 `plugins/skin/*.js`，`ORDER` 仍以 `plugins/skin.user.js` 为准。
- 已有章节导航与十六小节锚点（`grep "── [A-G]:"` / `grep "· [A-G][0-9]"`），编辑请对号入座。
