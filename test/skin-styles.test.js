import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { skinCss } from '../plugins/skin/styles.js'

function styledDom(t, css) {
  const dom = new JSDOM(`<!doctype html><html class="lsb-skin-shell-on lsb-canvas-mode lsb-skin-type-on lsb-skin-density-compact lsb-skin-code-on lsb-skin-floors-on lsb-skin-measure-on"><head></head><body>
    <main class="wrap"><ul class="post-list"><li class="post-item">帖子</li><li class="post-entry">楼层</li></ul>
    <div class="post-content"><p>正文</p><pre>代码</pre></div></main></body></html>`)
  t.after(() => dom.window.close())
  const sheet = dom.window.document.createElement('style')
  sheet.textContent = css
  dom.window.document.head.appendChild(sheet)
  return { style: (selector) => dom.window.getComputedStyle(dom.window.document.querySelector(selector)), sheet }
}

test('样式生成按调用方的实际壳状态与界面模式选择布局', (t) => {
  assert.equal(skinCss({}, { shellActive: false, uiMode: 'ios27' }), '')
  // cfg.shell alone cannot activate the legacy layout on a narrow viewport.
  assert.equal(skinCss({ shell: true, uiMode: 'legacy' }, { shellActive: false, uiMode: 'legacy' }), '')
  const legacy = styledDom(t, skinCss({}, { shellActive: true, uiMode: 'legacy' }))
  assert.equal(legacy.style('html').getPropertyValue('--lsb-shell-rail'), '240px')
  assert.equal(legacy.style('html').getPropertyValue('--lsb-canvas-chrome-height'), '')
  const canvas = styledDom(t, skinCss({}, { shellActive: true, uiMode: 'ios27' }))
  assert.equal(canvas.style('html').getPropertyValue('--lsb-canvas-chrome-height'), '56px')
  assert.equal(canvas.style('html').getPropertyValue('--lsb-shell-rail'), '')
})

test('正文样式开关独立生效，不依赖启用氢壳', (t) => {
  const typography = styledDom(t, skinCss({ typography: true }))
  assert.equal(typography.style('.post-content').lineHeight, '1.75')
  assert.equal(typography.style('.post-item').paddingBlock, '')
  const compact = styledDom(t, skinCss({ density: '紧凑' }))
  assert.equal(compact.style('.post-item').paddingBlock, '3px')
  const code = styledDom(t, skinCss({ codeblock: true }))
  assert.equal(code.style('pre').overflowX, 'auto')
  assert.equal(code.style('pre').fontSize, '13px')
  const floors = styledDom(t, skinCss({ floors: true }))
  // jsdom retains var() in CSSOM but cannot compute this border shorthand.
  assert.equal(floors.sheet.sheet.cssRules[0].style.getPropertyValue('border-bottom'), '1px solid var(--line-soft,#eee)')
  const measure = styledDom(t, skinCss({ measure: true }))
  const media = [...measure.sheet.sheet.cssRules].find((rule) => rule.conditionText === '(min-width:1280px)')
  assert.ok(media, '限宽规则只应在宽视口媒体查询中生效')
  assert.equal(media.cssRules[0].style.getPropertyValue('max-width'), '1120px')
})

test('样式生成读取每次传入的配置且不修改输入', (t) => {
  const cfg = { typography: true, density: '紧凑' }
  const context = Object.freeze({ shellActive: false, uiMode: 'ios27' })
  const first = skinCss(cfg, context)
  assert.deepEqual(cfg, { typography: true, density: '紧凑' })
  cfg.typography = false
  cfg.density = '舒适'
  assert.equal(skinCss(Object.freeze(cfg), context), '')
  assert.equal(styledDom(t, first).style('.post-content').lineHeight, '1.75')
  assert.equal(skinCss(), '')
})
