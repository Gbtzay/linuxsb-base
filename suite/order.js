/** 套件成员清单（单点真理） — 被 build-suite.mjs 与 test/suite.test.js 共享 */
export const ORDER = [
  'floor-stats',
  'hot-floor-badge',
  'resume-reading',
  'read-mark',
  'home-return',
  'hover-profile',
  'topic-preview',
  'unread-sentinel',
  'forum-watch',
  'checkin-calendar',
  'points-ledger',
  'title-quotes',
  'ai-summary',
  'data-migration',
  'my-archive',
  'annual-report',
  'skin',
  'live-feed',
]
/** 本机 workbench 联动，公开测试版不随氧分发；源文件仍可单独安装 */
export const SUITE_EXCLUDE = ['local-bridge']
