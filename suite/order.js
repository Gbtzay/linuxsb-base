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
  'perf-probe',
]
/** LTS 精简集：与 ORDER 同序，不含砍掉的模块 */
export const ORDER_LTS = [
  'floor-stats',
  'resume-reading',
  'read-mark',
  'home-return',
  'topic-preview',
  'unread-sentinel',
  'checkin-calendar',
  'points-ledger',
  'data-migration',
  'annual-report',
  'skin',
  'live-feed',
]
/** 本机 workbench 联动，公开测试版不随氧分发；源文件仍可单独安装 */
export const SUITE_EXCLUDE = ['local-bridge']
