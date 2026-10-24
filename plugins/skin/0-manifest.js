// @skin-part: 0 manifest — 头与 manifest/config（约 48 行，含 userscript 头）
// ==UserScript==
// @name         LSB·界面精修
// @namespace    https://linux.sb/
// @version      2.0.33
// @description  旧三段式与 iOS 27 单画布双模式界面：连续正文、工具浮层、外观与布局自定义。需要 LINUX.SB 基座。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==


(function () {
  'use strict'

  const manifest = {
    id: 'skin',
    name: '界面精修',
    version: '2.0.33',
    description: '旧三段式与 iOS 27 单画布双模式，保留正文排版与站内安全链',
    author: 'you',
    requires: { base: '^0.2.3' },
    permissions: ['ui', 'storage', 'events', 'read'],
    config: {
      shell: { type: 'switch', label: '氢壳', desc: '同时控制旧三段式和 iOS 27 单画布；关闭后恢复站点原生页面。', default: true },
      uiMode: {
        type: 'select',
        label: '界面模式',
        default: 'legacy',
        options: [
          { value: 'legacy', label: '旧三段式' },
          { value: 'ios27', label: 'iOS 27 单画布' },
        ],
      },
      topicSpa: { type: 'switch', label: '帖子页同文档软跳', desc: '默认开启；可关闭以恢复站点原生帖子生命周期与交互。', default: true },
      glass: { type: 'switch', label: '玻璃材料', default: false },
      glassOpacity: { type: 'number', label: '玻璃透明度（0.35–1）', default: 0.72 },
      glassBlur: { type: 'number', label: '玻璃模糊（0–32px）', default: 18 },
      baseFontSize: { type: 'number', label: '基础字号（12–32px）', default: 14 },
      fontFamily: { type: 'text', label: '界面字体', default: '' },
      fontUrl: { type: 'text', label: '字体 URL（HTTPS）', default: '' },
      backgroundVideoEnabled: { type: 'switch', label: '启用视频背景', default: false },
      backgroundVideoUrl: { type: 'text', label: '视频 URL（HTTPS）', default: '' },
      backgroundVideoLocalKey: { type: 'text', label: '本地视频资源键', default: '' },
      backgroundImageUrl: { type: 'text', label: '静态图片 URL（HTTPS）', default: '' },
      backgroundImageLocalKey: { type: 'text', label: '本地图片资源键', default: '' },
      fontLocalKey: { type: 'text', label: '本地字体资源键', default: '' },
      typography: { type: 'switch', label: '正文排版（行高 1.75 · 中文字体栈）', default: true },
      density: {
        type: 'select',
        label: '列表密度',
        default: '舒适',
        options: ['紧凑', '舒适'],
      },
      codeblock: { type: 'switch', label: '代码块样式强化', default: true },
      floors: { type: 'switch', label: '楼层优化（分隔线）', default: true },
      measure: { type: 'switch', label: '宽屏限宽阅读（≥1280px 生效）', default: false },
    },
  }
