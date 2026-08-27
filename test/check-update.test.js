import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SCRIPTS,
  gfJsonUrl,
  parseStoreScript,
  classifyVersion,
  localOxygenVersion,
  installHref,
} from '../src/check-update.js'

test('检查更新：Greasy Fork JSON 地址与安装页', () => {
  const h = SCRIPTS.find((s) => s.id === 'hydrogen')
  const o = SCRIPTS.find((s) => s.id === 'oxygen')
  assert.equal(h.gfId, 592914)
  assert.equal(o.gfId, 592915)
  assert.equal(gfJsonUrl(592914), 'https://greasyfork.org/zh-CN/scripts/592914.json')
  assert.equal(gfJsonUrl(592915), 'https://greasyfork.org/zh-CN/scripts/592915.json')
  assert.equal(h.installUrl, 'https://greasyfork.org/zh-CN/scripts/592914-linux-sb-%E6%B0%A2-beta')
  assert.equal(o.installUrl, 'https://greasyfork.org/zh-CN/scripts/592915-linux-sb-%E6%B0%A7-beta')
})

test('检查更新：parseStoreScript 抽出 version / url；缺 version 为 null', () => {
  assert.deepEqual(parseStoreScript({ version: '0.1.32', url: 'https://greasyfork.org/zh-CN/scripts/592914' }), {
    version: '0.1.32',
    url: 'https://greasyfork.org/zh-CN/scripts/592914',
  })
  assert.equal(parseStoreScript({ url: 'https://x' }), null)
  assert.equal(parseStoreScript(null), null)
  assert.equal(parseStoreScript('0.1.32'), null)
})

test('检查更新：classifyVersion 落后 / 相同 / 比商店新 / 无效', () => {
  assert.equal(classifyVersion('0.1.31', '0.1.32'), 'behind')
  assert.equal(classifyVersion('0.1.32', '0.1.32'), 'equal')
  assert.equal(classifyVersion('0.1.33', '0.1.32'), 'ahead')
  assert.equal(classifyVersion('foo', '0.1.32'), 'invalid')
  assert.equal(classifyVersion('0.1.32', 'bar'), 'invalid')
})

test('检查更新：localOxygenVersion 看 suite，停用也算已装', () => {
  assert.equal(localOxygenVersion([{ id: 'suite', version: '1.0.83' }]), '1.0.83')
  assert.equal(localOxygenVersion([{ id: 'suite', version: '1.0.83', state: 'disabled' }]), '1.0.83')
  assert.equal(localOxygenVersion([{ id: 'title-quotes', version: '1.0.9' }]), null)
  assert.equal(localOxygenVersion([]), null)
})

test('检查更新：installHref 空 url 回退', () => {
  assert.equal(installHref({ version: '1', url: 'https://store/h' }, 'https://fallback'), 'https://store/h')
  assert.equal(installHref({ version: '1', url: '' }, 'https://fallback'), 'https://fallback')
  assert.equal(installHref(null, 'https://fallback'), 'https://fallback')
})
