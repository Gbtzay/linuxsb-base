import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { composeSkinSource, syncSkinSource } from '../scripts/build-skin.mjs'

const repo = fileURLToPath(new URL('../', import.meta.url))
const generatorPath = new URL('../scripts/build-skin.mjs', import.meta.url)
const template = `// ==UserScript==
// @name         Skin fixture
// @version      1.0.0
// ==/UserScript==
(function () {
  const manifest = { id: 'skin', version: '1.0.0' }
  // @LSB_SKIN_CANVAS_STATE
  // @LSB_SKIN_STYLES
  // @LSB_SKIN_MEDIA
  // @LSB_SKIN_PLUGIN_CATALOG
  // @LSB_SKIN_SEARCH
  // @LSB_SKIN_NAVIGATION
  // @LSB_SKIN_CONTENT
  // @LSB_SKIN_HISTORY
  // @LSB_SKIN_PROFILE
  // @LSB_SKIN_SITE_CARDS
  // @LSB_SKIN_ONLINE
  // @LSB_SKIN_ASIDE_CARDS
  // @LSB_SKIN_ASIDE_VIEWS
  // @LSB_SKIN_CONFIG
  // @LSB_SKIN_SPA_DOCUMENT
  // @LSB_SKIN_VIEW_CACHE
  // @LSB_SKIN_SPA
  // @LSB_SKIN_HOME_INFINITE
  // @LSB_SKIN_NATIVE_ENHANCEMENTS
  // @LSB_SKIN_SETTINGS
  // @LSB_SKIN_TOPBAR
  // @LSB_SKIN_TIMELINE
  // @LSB_SKIN_SELECTION
  // @LSB_SKIN_APPEARANCE
  // @LSB_SKIN_SURFACE_LAYOUT
  // @LSB_SKIN_CANVAS_SCROLL
  // @LSB_SKIN_WINDOWS
  // @LSB_SKIN_CANVAS_HOST
  // @LSB_SKIN_RUNTIME
  globalThis.result = { width: widthClass(700), surfaces: defaultCanvasState().global.surfaceDefaults }
  globalThis.result.catalog = typeof createSkinPluginCatalog === 'function' ? createSkinPluginCatalog().features() : 'missing-catalog'
  globalThis.result.search = typeof createSkinSearchController === 'function' ? createSkinSearchController().host() : 'missing-search'
  globalThis.result.navigation = typeof createSkinNavigation === 'function' ? createSkinNavigation().navigationEntries() : 'missing-navigation'
  globalThis.result.content = typeof createSkinContentController === 'function' ? createSkinContentController().findOutlet() : 'missing-content'
  globalThis.result.history = typeof createSkinHistoryController === 'function' ? createSkinHistoryController().acceptPop() : 'missing-history'
  globalThis.result.profile = typeof createSkinProfileController === 'function' ? createSkinProfileController().mount() : 'missing-profile'
  globalThis.result.siteCards = typeof createSkinSiteCardsController === 'function' ? createSkinSiteCardsController().sync() : 'missing-site-cards'
  globalThis.result.asideCards = typeof createSkinAsideCardsController === 'function' ? createSkinAsideCardsController().adopt() : 'missing-aside-cards'
  globalThis.result.asideViews = typeof createSkinAsideViewsController === 'function' ? createSkinAsideViewsController().sync() : 'missing-aside-views'
  globalThis.result.spaDocument = typeof createSkinSpaDocumentController === 'function' ? createSkinSpaDocumentController().captureHead() : 'missing-document'
  globalThis.result.spa = typeof createSkinSpaController === 'function' ? createSkinSpaController().bind() : 'missing-spa'
  globalThis.result.homeInfinite = typeof createSkinHomeInfiniteController === 'function' ? createSkinHomeInfiniteController().sync() : 'missing-home-infinite'
  globalThis.result.nativeEnhancements = typeof createSkinNativeEnhancementsController === 'function' ? createSkinNativeEnhancementsController().refresh() : 'missing-native-enhancements'
  globalThis.result.settings = typeof createSkinSettingsController === 'function' ? createSkinSettingsController().render() : 'missing-settings'
  globalThis.result.topbar = typeof createSkinTopbarController === 'function' ? createSkinTopbarController().renderCanvasTopLinks() : 'missing-topbar'
  globalThis.result.timeline = typeof createSkinTimelineController === 'function' ? createSkinTimelineController().ensure() : 'missing-timeline'
  globalThis.result.selection = typeof createSkinSelectionController === 'function' ? createSkinSelectionController().bind() : 'missing-selection'
  globalThis.result.appearance = typeof createSkinAppearanceController === 'function' ? createSkinAppearanceController().sync() : 'missing-appearance'
  globalThis.result.surfaceLayout = typeof createSkinSurfaceLayoutController === 'function' ? createSkinSurfaceLayoutController().applyModes() : 'missing-surface-layout'
  globalThis.result.canvasScroll = typeof createSkinCanvasScrollController === 'function' ? createSkinCanvasScrollController().bind() : 'missing-canvas-scroll'
  globalThis.result.windowController = typeof createSkinWindowController === 'function' ? createSkinWindowController().mount() : 'missing-window'
  globalThis.result.canvasHost = typeof createSkinCanvasHostController === 'function' ? createSkinCanvasHostController().mount() : 'missing-canvas-host'
  globalThis.result.runtime = typeof createSkinRuntimeController === 'function' ? createSkinRuntimeController().applyAll() : 'missing-runtime'
  globalThis.result.viewCache = typeof createSkinViewCache === 'function' ? createSkinViewCache().take() : 'missing-cache'
  globalThis.result.config = typeof createSkinConfigController === 'function' ? createSkinConfigController().read() : 'missing-config'
  globalThis.result.online = typeof createSkinOnlineController === 'function' ? createSkinOnlineController().start() : 'missing-online'
  globalThis.result.media = typeof createSkinMediaController === 'function' ? createSkinMediaController().sync() : 'missing-media'
  globalThis.result.css = typeof skinCss === 'function' ? skinCss({ spacing: 17 }, { shellActive: true, uiMode: 'ios27' }) : 'missing-styles'
})()
`
const stateSource = `export function widthClass() { return 'changed-at-source' }
export function defaultCanvasState() {
  return { global: { surfaceDefaults: {
    // @LSB_DEV_AI_START
    aiCard: { width: 420 },
    // @LSB_DEV_AI_END
    siteCard: { width: 360 },
  } } }
}
`
const styleSource = `export function skinCss(config, { shellActive, uiMode }) {
  return '.fixture{padding:' + config.spacing + 'px;--mode:' + uiMode + ';--active:' + shellActive + '}'
}
`

const mediaSource = `export function createSkinMediaController() { return { sync() { return 'media-ready' } } }\n`

const entrySources = [
  { file: 'runtime-controller.js', marker: '@LSB_SKIN_RUNTIME', result: 'runtime', value: 'runtime-ready', source: "export function createSkinRuntimeController() { return { applyAll() { return 'runtime-ready' } } }\n" },
  { file: 'canvas-host-controller.js', marker: '@LSB_SKIN_CANVAS_HOST', result: 'canvasHost', value: 'canvas-host-ready', source: "export function createSkinCanvasHostController() { return { mount() { return 'canvas-host-ready' } } }\n" },
  { file: 'window-controller.js', marker: '@LSB_SKIN_WINDOWS', result: 'windowController', value: 'window-ready', source: "export function createSkinWindowController() { return { mount() { return 'window-ready' } } }\n" },
  { file: 'canvas-scroll-controller.js', marker: '@LSB_SKIN_CANVAS_SCROLL', result: 'canvasScroll', value: 'canvas-scroll-ready', source: "export function createSkinCanvasScrollController() { return { bind() { return 'canvas-scroll-ready' } } }\n" },
  { file: 'surface-layout-controller.js', marker: '@LSB_SKIN_SURFACE_LAYOUT', result: 'surfaceLayout', value: 'surface-layout-ready', source: "export function createSkinSurfaceLayoutController() { return { applyModes() { return 'surface-layout-ready' } } }\n" },
  { file: 'appearance-controller.js', marker: '@LSB_SKIN_APPEARANCE', result: 'appearance', value: 'appearance-ready', source: "export function createSkinAppearanceController() { return { sync() { return 'appearance-ready' } } }\n" },
  { file: 'selection-controller.js', marker: '@LSB_SKIN_SELECTION', result: 'selection', value: 'selection-ready', source: "export function createSkinSelectionController() { return { bind() { return 'selection-ready' } } }\n" },
  { file: 'timeline-controller.js', marker: '@LSB_SKIN_TIMELINE', result: 'timeline', value: 'timeline-ready', source: "export function createSkinTimelineController() { return { ensure() { return 'timeline-ready' } } }\n" },
  { file: 'topbar-controller.js', marker: '@LSB_SKIN_TOPBAR', result: 'topbar', value: 'topbar-ready', source: "export function createSkinTopbarController() { return { renderCanvasTopLinks() { return 'topbar-ready' } } }\n" },
  { file: 'settings-controller.js', marker: '@LSB_SKIN_SETTINGS', result: 'settings', value: 'settings-ready', source: "export function createSkinSettingsController() { return { render() { return 'settings-ready' } } }\n" },
  { file: 'native-enhancements-controller.js', marker: '@LSB_SKIN_NATIVE_ENHANCEMENTS', result: 'nativeEnhancements', value: 'native-enhancements-ready', source: "export function createSkinNativeEnhancementsController() { return { refresh() { return 'native-enhancements-ready' } } }\n" },
  { file: 'home-infinite-controller.js', marker: '@LSB_SKIN_HOME_INFINITE', result: 'homeInfinite', value: 'home-infinite-ready', source: "export function createSkinHomeInfiniteController() { return { sync() { return 'home-infinite-ready' } } }\n" },
  { file: 'spa-controller.js', marker: '@LSB_SKIN_SPA', result: 'spa', value: 'spa-ready', source: "export function createSkinSpaController() { return { bind() { return 'spa-ready' } } }\n" },
  { file: 'spa-document.js', marker: '@LSB_SKIN_SPA_DOCUMENT', result: 'spaDocument', value: 'document-ready', source: "export function createSkinSpaDocumentController() { return { captureHead() { return 'document-ready' } } }\n" },
  { file: 'view-cache.js', marker: '@LSB_SKIN_VIEW_CACHE', result: 'viewCache', value: 'cache-ready', source: "export function createSkinViewCache() { return { take() { return 'cache-ready' } } }\n" },
  { file: 'config-controller.js', marker: '@LSB_SKIN_CONFIG', result: 'config', value: 'config-ready', source: "export function createSkinConfigController() { return { read() { return 'config-ready' } } }\n" },
  { file: 'legacy-aside-cards.js', marker: '@LSB_SKIN_ASIDE_CARDS', result: 'asideCards', value: 'aside-cards-ready', source: "export function createSkinAsideCardsController() { return { adopt() { return 'aside-cards-ready' } } }\n" },
  { file: 'legacy-aside-views.js', marker: '@LSB_SKIN_ASIDE_VIEWS', result: 'asideViews', value: 'aside-views-ready', source: "export function createSkinAsideViewsController() { return { sync() { return 'aside-views-ready' } } }\n" },
  { file: 'online-controller.js', marker: '@LSB_SKIN_ONLINE', result: 'online', value: 'online-ready', source: "export function createSkinOnlineController() { return { start() { return 'online-ready' } } }\n" },
  { file: 'profile-controller.js', marker: '@LSB_SKIN_PROFILE', result: 'profile', value: 'profile-ready', source: "export function createSkinProfileController() { return { mount() { return 'profile-ready' } } }\n" },
  { file: 'site-cards-controller.js', marker: '@LSB_SKIN_SITE_CARDS', result: 'siteCards', value: 'site-ready', source: "export function createSkinSiteCardsController() { return { sync() { return 'site-ready' } } }\n" },
  { file: 'content-controller.js', marker: '@LSB_SKIN_CONTENT', result: 'content', value: 'content-ready', source: "export function createSkinContentController() { return { findOutlet() { return 'content-ready' } } }\n" },
  { file: 'history-controller.js', marker: '@LSB_SKIN_HISTORY', result: 'history', value: 'history-ready', source: "export function createSkinHistoryController() { return { acceptPop() { return 'history-ready' } } }\n" },
  { file: 'navigation.js', marker: '@LSB_SKIN_NAVIGATION', result: 'navigation', value: 'navigation-ready', source: "export function createSkinNavigation() { return { navigationEntries() { return 'navigation-ready' } } }\n" },
  { file: 'plugin-catalog.js', marker: '@LSB_SKIN_PLUGIN_CATALOG', result: 'catalog', value: 'catalog-ready', source: "export function createSkinPluginCatalog() { return { features() { return 'catalog-ready' } } }\n" },
  { file: 'search-controller.js', marker: '@LSB_SKIN_SEARCH', result: 'search', value: 'search-ready', source: "export function createSkinSearchController() { return { host() { return 'search-ready' } } }\n" },
]

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'lsb-skin-source-'))
  t.after(() => {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + '\\') || resolve(root).startsWith(resolve(tmpdir()) + '/'))
    rmSync(root, { recursive: true, force: true })
  })
  for (const dir of ['plugins/skin', 'suite', 'scripts']) mkdirSync(join(root, dir), { recursive: true })
  for (const file of ['build-suite.mjs', 'scripts/build-common.mjs', 'scripts/build-profile.mjs', 'scripts/run-tests.mjs', 'suite/version.js']) {
    copyFileSync(join(repo, file), join(root, file))
  }
  copyFileSync(generatorPath, join(root, 'scripts/build-skin.mjs'))
  writeFileSync(join(root, 'package.json'), '{"type":"module"}')
  writeFileSync(join(root, 'suite/order.js'), "export const ORDER = ['skin']\nexport const ORDER_RELEASE = ORDER\nexport const SUITE_EXCLUDE = []\n")
  writeFileSync(join(root, 'suite/suite-center.js'), 'globalThis.members = __SUITE_MEMBERS__\n')
  writeFileSync(join(root, 'plugins/skin/skin.template.js'), template)
  writeFileSync(join(root, 'plugins/skin/canvas-state.js'), stateSource)
  writeFileSync(join(root, 'plugins/skin/styles.js'), styleSource)
  writeFileSync(join(root, 'plugins/skin/media-controller.js'), mediaSource)
  for (const item of entrySources) writeFileSync(join(root, 'plugins/skin', item.file), item.source)
  writeFileSync(join(root, 'plugins/skin.user.js'), template.replace('  // @LSB_SKIN_CANVAS_STATE',
    "  function widthClass() { return 'stale-output' }\n  function defaultCanvasState() { return { global: { surfaceDefaults: {} } } }"))
  return root
}

test('skin 构建从拆分源读取变更，独立脚本及 dev/release 共享状态与样式模块', (t) => {
  const root = fixture(t)
  for (const profile of ['release', 'dev']) {
    const built = spawnSync(process.execPath, ['build-suite.mjs', `--profile=${profile}`], { cwd: root, encoding: 'utf8' })
    assert.equal(built.status, 0, built.stderr)
    const context = {}
    runInNewContext(readFileSync(join(root, profile === 'dev' ? 'dist-dev' : 'dist', 'linuxsb-suite.user.js'), 'utf8'), context)
    assert.equal(context.result.media, 'media-ready')
    assert.equal(context.result.catalog, 'catalog-ready')
    assert.equal(context.result.search, 'search-ready')
    assert.equal(context.result.navigation, 'navigation-ready')
    assert.equal(context.result.content, 'content-ready')
    assert.equal(context.result.history, 'history-ready')
    assert.equal(context.result.profile, 'profile-ready')
    assert.equal(context.result.siteCards, 'site-ready')
    assert.equal(context.result.config, 'config-ready')
    assert.equal(context.result.spaDocument, 'document-ready')
    assert.equal(context.result.viewCache, 'cache-ready')
    assert.equal(context.result.spa, 'spa-ready')
    assert.equal(context.result.homeInfinite, 'home-infinite-ready')
    assert.equal(context.result.nativeEnhancements, 'native-enhancements-ready')
    assert.equal(context.result.settings, 'settings-ready')
    assert.equal(context.result.topbar, 'topbar-ready')
    assert.equal(context.result.timeline, 'timeline-ready')
    assert.equal(context.result.selection, 'selection-ready')
    assert.equal(context.result.appearance, 'appearance-ready')
    assert.equal(context.result.surfaceLayout, 'surface-layout-ready')
    assert.equal(context.result.canvasScroll, 'canvas-scroll-ready')
    assert.equal(context.result.windowController, 'window-ready')
    assert.equal(context.result.canvasHost, 'canvas-host-ready')
    assert.equal(context.result.runtime, 'runtime-ready')
    assert.equal(context.result.online, 'online-ready')
    assert.equal(context.result.asideCards, 'aside-cards-ready')
    assert.equal(context.result.asideViews, 'aside-views-ready')
    assert.equal(context.result.width, 'changed-at-source', '套件不能继续读取过期的 skin.user.js')
    assert.equal(!!context.result.surfaces.aiCard, profile === 'dev')
    assert.equal(context.result.surfaces.siteCard.width, 360)
    assert.equal(context.result.css, '.fixture{padding:17px;--mode:ios27;--active:true}')
  }
  const standalone = {}
  runInNewContext(readFileSync(join(root, 'plugins/skin.user.js'), 'utf8'), standalone)
  assert.equal(standalone.result.media, 'media-ready')
  assert.equal(standalone.result.catalog, 'catalog-ready')
  assert.equal(standalone.result.search, 'search-ready')
  assert.equal(standalone.result.navigation, 'navigation-ready')
  assert.equal(standalone.result.content, 'content-ready')
  assert.equal(standalone.result.history, 'history-ready')
  assert.equal(standalone.result.profile, 'profile-ready')
  assert.equal(standalone.result.siteCards, 'site-ready')
  assert.equal(standalone.result.config, 'config-ready')
  assert.equal(standalone.result.spaDocument, 'document-ready')
  assert.equal(standalone.result.viewCache, 'cache-ready')
  assert.equal(standalone.result.spa, 'spa-ready')
  assert.equal(standalone.result.homeInfinite, 'home-infinite-ready')
  assert.equal(standalone.result.nativeEnhancements, 'native-enhancements-ready')
  assert.equal(standalone.result.settings, 'settings-ready')
  assert.equal(standalone.result.topbar, 'topbar-ready')
  assert.equal(standalone.result.timeline, 'timeline-ready')
  assert.equal(standalone.result.selection, 'selection-ready')
  assert.equal(standalone.result.appearance, 'appearance-ready')
  assert.equal(standalone.result.surfaceLayout, 'surface-layout-ready')
  assert.equal(standalone.result.canvasScroll, 'canvas-scroll-ready')
  assert.equal(standalone.result.windowController, 'window-ready')
  assert.equal(standalone.result.canvasHost, 'canvas-host-ready')
  assert.equal(standalone.result.runtime, 'runtime-ready')
  assert.equal(standalone.result.online, 'online-ready')
  assert.equal(standalone.result.asideCards, 'aside-cards-ready')
  assert.equal(standalone.result.asideViews, 'aside-views-ready')
  assert.equal(standalone.result.width, 'changed-at-source')
  assert.ok(standalone.result.surfaces.aiCard, '独立开发脚本保留 AI')
  assert.equal(standalone.result.css, '.fixture{padding:17px;--mode:ios27;--active:true}')
})

test('样式修改使只读校验失败，重建后独立脚本使用更新的样式', (t) => {
  const root = fixture(t)
  syncSkinSource({ root })
  const output = join(root, 'plugins/skin.user.js')
  const before = readFileSync(output, 'utf8')
  writeFileSync(join(root, 'plugins/skin/styles.js'), styleSource.replace('padding:', 'margin:'))
  assert.throws(() => syncSkinSource({ root, check: true }), /build:skin/)
  assert.equal(readFileSync(output, 'utf8'), before)
  const built = spawnSync(process.execPath, ['build-suite.mjs', '--profile=release'], { cwd: root, encoding: 'utf8' })
  assert.equal(built.status, 0, built.stderr)
  for (const file of ['plugins/skin.user.js', 'dist/linuxsb-suite.user.js']) {
    const context = {}
    runInNewContext(readFileSync(join(root, file), 'utf8'), context)
    assert.equal(context.result.css, '.fixture{margin:17px;--mode:ios27;--active:true}')
  }
})

test('skin 校验发现模块和生成文件漂移，只读检查不能覆盖文件', (t) => {
  const root = fixture(t)
  const output = join(root, 'plugins/skin.user.js')
  const original = readFileSync(output, 'utf8')
  assert.throws(() => syncSkinSource({ root, check: true }), /build:skin|过期|生成/)
  assert.equal(readFileSync(output, 'utf8'), original)
  syncSkinSource({ root })
  const generated = readFileSync(output, 'utf8')
  syncSkinSource({ root, check: true })
  writeFileSync(join(root, 'plugins/skin/canvas-state.js'), stateSource.replace('changed-at-source', 'next-change'))
  assert.throws(() => syncSkinSource({ root, check: true }), /build:skin|过期|生成/)
  assert.equal(readFileSync(output, 'utf8'), generated)
  writeFileSync(join(root, 'plugins/skin/canvas-state.js'), stateSource)
  writeFileSync(output, generated + '\n// hand edited\n')
  assert.throws(() => syncSkinSource({ root, check: true }), /build:skin|过期|生成/)
  rmSync(output)
  assert.throws(() => syncSkinSource({ root, check: true }), /build:skin|过期|生成/)
  assert.equal(existsSync(output), false, '只读校验不得补写缺失的生成文件')
})

test('skin 生成器拒绝坏编码、缺失/重复注入点、跨文件 AI 标记和错误语法', (t) => {
  const root = fixture(t)
  const cases = [
    ['\ufeff' + template, stateSource, /BOM/],
    [template.replaceAll('\n', '\r\n'), stateSource, /CRLF|行尾/],
    [template, '\ufeff' + stateSource, /BOM/],
    [template, stateSource.replaceAll('\n', '\r\n'), /CRLF|行尾/],
    [template.replace('  // @LSB_SKIN_CANVAS_STATE', ''), stateSource, /注入|标记/],
    [template.replace('  // @LSB_SKIN_CANVAS_STATE', '  // @LSB_SKIN_CANVAS_STATE\n  // @LSB_SKIN_CANVAS_STATE'), stateSource, /注入|标记/],
    [template + '// @LSB_DEV_AI_END\n', stateSource + '// @LSB_DEV_AI_START\n', /START|END|标记/],
    [template, stateSource + '\nexport function broken( {', /SyntaxError|Unexpected|语法/],
  ]
  for (const [entry, module, error] of cases) {
    writeFileSync(join(root, 'plugins/skin/skin.template.js'), entry)
    writeFileSync(join(root, 'plugins/skin/canvas-state.js'), module)
    assert.throws(() => composeSkinSource({ root }), error)
  }
})

test('测试入口在启动用例前拒绝过期 skin，提示生成且不修改输出', (t) => {
  const root = fixture(t)
  const output = join(root, 'plugins/skin.user.js')
  const stale = readFileSync(output, 'utf8')
  const result = spawnSync(process.execPath, ['scripts/run-tests.mjs', 'skin'], { cwd: root, encoding: 'utf8' })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /build:skin/)
  assert.equal(readFileSync(output, 'utf8'), stale)
})

test('样式输入同样拒绝坏编码、错误语法、未配对 AI 和缺失/重复注入点', (t) => {
  const root = fixture(t)
  const cases = [
    [template, '\ufeff' + styleSource, /BOM/],
    [template, styleSource.replaceAll('\n', '\r\n'), /CRLF|行尾/],
    [template, styleSource + '// @LSB_DEV_AI_START\n', /START|END|标记/],
    [template, styleSource + '// @LSB_SKIN_CANVAS_STATE\n', /注入|标记/],
    [template, styleSource + '\nexport function broken( {', /SyntaxError|Unexpected|语法/],
    [template.replace('  // @LSB_SKIN_STYLES', ''), styleSource, /注入|标记/],
    [template.replace('  // @LSB_SKIN_STYLES', '  // @LSB_SKIN_STYLES\n  // @LSB_SKIN_STYLES'), styleSource, /注入|标记/],
  ]
  const output = join(root, 'plugins/skin.user.js')
  const before = readFileSync(output, 'utf8')
  for (const [entry, module, error] of cases) {
    writeFileSync(join(root, 'plugins/skin/skin.template.js'), entry)
    writeFileSync(join(root, 'plugins/skin/styles.js'), module)
    assert.throws(() => syncSkinSource({ root }), error)
    assert.equal(readFileSync(output, 'utf8'), before, '坏输入不能覆盖可安装脚本')
  }
  writeFileSync(join(root, 'plugins/skin/styles.js'), styleSource)
  writeFileSync(join(root, 'plugins/skin/canvas-state.js'), stateSource + '// @LSB_SKIN_STYLES\n')
  for (const entry of [template.replace('  // @LSB_SKIN_STYLES', ''), template]) {
    writeFileSync(join(root, 'plugins/skin/skin.template.js'), entry)
    assert.throws(() => syncSkinSource({ root }), /注入|标记/, '模块不能代替或复制模板的样式注入点')
    assert.equal(readFileSync(output, 'utf8'), before)
  }
})

test('仓库中的独立 skin 与规范源码一致', () => {
  syncSkinSource({ check: true })
})

test('媒体源变更进入套件且只读检查不能修复过期输出', (t) => {
  const root = fixture(t)
  syncSkinSource({ root })
  const output = join(root, 'plugins/skin.user.js')
  const before = readFileSync(output, 'utf8')
  writeFileSync(join(root, 'plugins/skin/media-controller.js'), mediaSource.replace('media-ready', 'media-updated'))
  assert.throws(() => syncSkinSource({ root, check: true }), /build:skin/)
  assert.equal(readFileSync(output, 'utf8'), before)
  const built = spawnSync(process.execPath, ['build-suite.mjs', '--profile=release'], { cwd: root, encoding: 'utf8' })
  assert.equal(built.status, 0, built.stderr)
  for (const file of ['plugins/skin.user.js', 'dist/linuxsb-suite.user.js']) {
    const context = {}
    runInNewContext(readFileSync(join(root, file), 'utf8'), context)
    assert.equal(context.result.media, 'media-updated')
  }
})

test('媒体输入拒绝坏编码、语法、AI 标记和伪造注入点', (t) => {
  const root = fixture(t)
  const output = join(root, 'plugins/skin.user.js')
  const before = readFileSync(output, 'utf8')
  const cases = [
    [template, '\ufeff' + mediaSource, /BOM/],
    [template, mediaSource.replaceAll('\n', '\r\n'), /CRLF|行尾/],
    [template, mediaSource + '// @LSB_DEV_AI_START\n', /START|END|标记/],
    [template, mediaSource + '// @LSB_SKIN_STYLES\n', /注入|标记/],
    [template, mediaSource + 'export function broken( {', /SyntaxError|Unexpected|语法/],
    [template.replace('  // @LSB_SKIN_MEDIA', ''), mediaSource, /注入|标记/],
    [template.replace('  // @LSB_SKIN_MEDIA', '  // @LSB_SKIN_MEDIA\n  // @LSB_SKIN_MEDIA'), mediaSource, /注入|标记/],
  ]
  for (const [entry, module, error] of cases) {
    writeFileSync(join(root, 'plugins/skin/skin.template.js'), entry)
    writeFileSync(join(root, 'plugins/skin/media-controller.js'), module)
    assert.throws(() => syncSkinSource({ root }), error)
    assert.equal(readFileSync(output, 'utf8'), before)
  }
  writeFileSync(join(root, 'plugins/skin/media-controller.js'), mediaSource)
  writeFileSync(join(root, 'plugins/skin/styles.js'), styleSource + '// @LSB_SKIN_MEDIA\n')
  for (const entry of [template, template.replace('  // @LSB_SKIN_MEDIA', '')]) {
    writeFileSync(join(root, 'plugins/skin/skin.template.js'), entry)
    assert.throws(() => syncSkinSource({ root }), /注入|标记/)
    assert.equal(readFileSync(output, 'utf8'), before)
  }
})

for (const item of entrySources) {
  test(`${item.file} 源变更进入实际套件，只读检查拒绝过期产物`, (t) => {
    const root = fixture(t)
    syncSkinSource({ root })
    const output = join(root, 'plugins/skin.user.js')
    const before = readFileSync(output, 'utf8')
    writeFileSync(join(root, 'plugins/skin', item.file), item.source.replace(item.value, 'updated-source'))
    assert.throws(() => syncSkinSource({ root, check: true }), /build:skin/)
    assert.equal(readFileSync(output, 'utf8'), before)
    const built = spawnSync(process.execPath, ['build-suite.mjs', '--profile=release'], { cwd: root, encoding: 'utf8' })
    assert.equal(built.status, 0, built.stderr)
    for (const file of ['plugins/skin.user.js', 'dist/linuxsb-suite.user.js']) {
      const context = {}
      runInNewContext(readFileSync(join(root, file), 'utf8'), context)
      assert.equal(context.result[item.result], 'updated-source')
    }
  })

  test(`${item.file} 坏输入和缺失、复制、冒充注入点不能覆盖产物`, (t) => {
    const root = fixture(t)
    const output = join(root, 'plugins/skin.user.js')
    const before = readFileSync(output, 'utf8')
    const marker = `  // ${item.marker}\n`
    const markerError = new RegExp(`唯一的 ${item.marker} 注入标记`)
    const cases = [
      [template, '\ufeff' + item.source, /BOM/],
      [template, item.source.replaceAll('\n', '\r\n'), /CRLF|行尾/],
      [template, item.source + '// @LSB_DEV_AI_START\n', /START|END|标记/],
      [template, item.source + '// @LSB_SKIN_MEDIA\n', /注入|标记/],
      [template, item.source + 'export function broken( {', /SyntaxError|Unexpected|语法/],
      [template.replace(marker, ''), item.source, markerError],
      [template.replace(marker, `${marker}${marker}`), item.source, markerError],
    ]
    for (const [entry, source, error] of cases) {
      writeFileSync(join(root, 'plugins/skin/skin.template.js'), entry)
      writeFileSync(join(root, 'plugins/skin', item.file), source)
      assert.throws(() => syncSkinSource({ root }), error)
      assert.equal(readFileSync(output, 'utf8'), before)
    }
    writeFileSync(join(root, 'plugins/skin', item.file), item.source)
    writeFileSync(join(root, 'plugins/skin/styles.js'), styleSource + `// ${item.marker}\n`)
    for (const entry of [template, template.replace(marker, '')]) {
      writeFileSync(join(root, 'plugins/skin/skin.template.js'), entry)
      assert.throws(() => syncSkinSource({ root }), /注入|标记/)
      assert.equal(readFileSync(output, 'utf8'), before)
    }
  })
}
