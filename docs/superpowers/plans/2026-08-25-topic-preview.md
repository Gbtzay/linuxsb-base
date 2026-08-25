# 主楼预览 Implementation Plan

> iframe 嵌原帖 + 裁壳；外壳仍是套件浮窗。不要照抄 lsb-preview 扩展。

**Goal:** 列表「预览」打开蒙层浮窗，同源 iframe 嵌 `/topic/N`，load 后裁掉站点外壳。

**Tech Stack:** 现有 `topic-preview` 插件 + JSDOM 测试。不改基座。

## Files

- Modify: `plugins/topic-preview.user.js`（1.1.0）
- Modify: `test/topic-preview.test.js`
- Modify: `build-suite.mjs` / `suite/suite-center.js` → 1.0.20
- Modify: `README.md` 插件表一句
- Modify: spec（已与本计划对齐）

## Tasks

- [ ] 测试改为 iframe / 裁剪 / 换帖 / 停用
- [ ] 插件去掉 fetch 消毒缓存，改为 iframe + crop
- [ ] 套件 1.0.20，`npm test` 全绿
