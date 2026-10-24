import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeShellTokens, moduleInspectorModel, sanitizeTokenValue, tokenCss } from '../src/shell-style.js'

test('令牌只接受白名单值并限制字号与模糊半径', () => {
  assert.equal(sanitizeTokenValue('baseFontSize', 40), '32px')
  assert.equal(sanitizeTokenValue('glassBlur', -4), '0px')
  assert.equal(sanitizeTokenValue('textColor', '#abc'), '#abc')
  assert.equal(sanitizeTokenValue('textColor', 'red; background:url(x)'), null)
  assert.equal(sanitizeTokenValue('fontFamily', 'system-ui, "Segoe UI"'), 'system-ui, "Segoe UI"')
  assert.equal(sanitizeTokenValue('fontFamily', "'思源黑体', sans-serif"), "'思源黑体', sans-serif")
  assert.equal(sanitizeTokenValue('fontFamily', 'url(https://evil.test/font)'), null)
})

test('局部令牌为空时继承全局，CSS 序列化不带未知属性', () => {
  const merged = mergeShellTokens(
    { baseFontSize: 16, textColor: '#123456', density: '舒适' },
    { baseFontSize: '', textColor: null },
  )
  assert.equal(merged.baseFontSize, '16px')
  assert.equal(merged.textColor, '#123456')
  assert.equal(merged.density, '舒适')
  const css = tokenCss({ ...merged, unknown: 'color:red;body{display:none}' })
  assert.match(css, /--lsb-shell-font-size:16px/)
  assert.doesNotMatch(css, /unknown|display:none|body\{/)
})

test('模块检查器区分覆盖值和继承值', () => {
  const model = moduleInspectorModel({ windows: { content: { x: 1, y: 2, width: 3, height: 4, overrides: { baseFontSize: 20 } } } }, 'content')
  assert.equal(model.values.baseFontSize, '20px')
  assert.equal(model.inherited.baseFontSize, false)
  assert.equal(model.values.textColor, null)
  assert.equal(model.inherited.textColor, true)
})

