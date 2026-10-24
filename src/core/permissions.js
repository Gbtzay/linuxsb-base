/** 权限单点真理 — 被 core.js 与 runtime/capabilities.js 共享 */

export const PERMISSIONS = {
  read: '读取页面结构与站内 GET 请求',
  write: '代表当前用户发起写操作（回复/点赞/收藏等）',
  storage: '持久化自己的数据',
  ui: '注册面板、注入界面元素',
  net: '访问站外域名（需脚本自身 @connect）',
  admin: '全库数据导出/导入（数据主权，仅迁移类工具应申请）',
  events: '订阅与广播事件',
}

export const DEFAULT_PERMISSIONS = ['read', 'storage', 'ui', 'events']

const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function isIdempotent(method) {
  return IDEMPOTENT_METHODS.has(String(method || 'GET').toUpperCase())
}
