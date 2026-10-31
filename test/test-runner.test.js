import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectTestFiles } from '../scripts/run-tests.mjs'

test('quick 套件只选择日常基础与导航回归', () => {
  const files = [
    'ai-summary.test.js', 'bus.test.js', 'check-update.test.js', 'core.test.js',
    'dom.test.js', 'election.test.js', 'errors.test.js', 'home-return.test.js',
    'net.test.js', 'route.test.js', 'runtime-action-broker.test.js',
    'runtime-capabilities.test.js', 'runtime-request-broker.test.js',
    'shell-layout.test.js', 'shell-media.test.js', 'shell-scroll.test.js',
    'shell-style.test.js', 'site.test.js', 'store.test.js', 'test-runner.test.js',
    'skin.test.js', 'live-feed.test.js',
  ]
  assert.deepEqual(selectTestFiles(files, 'quick'), [
    'bus.test.js', 'check-update.test.js', 'core.test.js', 'dom.test.js',
    'election.test.js', 'errors.test.js', 'home-return.test.js', 'net.test.js',
    'route.test.js', 'runtime-action-broker.test.js', 'runtime-capabilities.test.js',
    'runtime-request-broker.test.js', 'shell-layout.test.js', 'shell-media.test.js',
    'shell-scroll.test.js', 'shell-style.test.js', 'site.test.js', 'store.test.js',
    'test-runner.test.js',
  ])
})

test('core 套件排除 AI 文件但保留普通回归', () => {
  const files = ['ai-summary.test.js', 'core.test.js', 'skin.test.js', 'ai-copilot.test.js']
  assert.deepEqual(selectTestFiles(files, 'core'), ['core.test.js', 'skin.test.js'])
})

test('all 和 ai 套件按文件名选择', () => {
  const files = ['ai-summary.test.js', 'core.test.js', 'ai-copilot.test.js']
  assert.deepEqual(selectTestFiles(files, 'all'), files.slice().sort())
  assert.deepEqual(selectTestFiles(files, 'ai'), ['ai-copilot.test.js', 'ai-summary.test.js'])
})

test('专项套件固定选择实时流和 skin 文件', () => {
  const files = [
    'skin-source.test.js', 'skin-styles.test.js', 'skin-media.test.js', 'skin-entry.test.js', 'skin-navigation.test.js', 'skin-lifecycle.test.js', 'skin-sidebar.test.js', 'skin-online.test.js', 'skin-legacy-aside.test.js', 'skin-config.test.js', 'skin-spa.test.js', 'skin-canvas.test.js', 'read-mark.test.js', 'core.test.js',
    'live-feed-v2.test.js', 'live-feed.test.js', 'skin.test.js', 'reading-acceptance.test.js',
  ]
  assert.deepEqual(selectTestFiles(files, 'live-feed'), [
    'live-feed.test.js', 'live-feed-v2.test.js', 'read-mark.test.js',
  ])
  assert.deepEqual(selectTestFiles(files, 'skin'), ['skin-source.test.js', 'skin-styles.test.js', 'skin-media.test.js', 'skin-entry.test.js', 'skin-navigation.test.js', 'skin-lifecycle.test.js', 'skin-sidebar.test.js', 'skin-online.test.js', 'skin-legacy-aside.test.js', 'skin-config.test.js', 'skin-spa.test.js', 'skin-canvas.test.js', 'skin.test.js', 'reading-acceptance.test.js'])
})

test('未知套件直接拒绝，避免静默运行错误范围', () => {
  assert.throws(() => selectTestFiles(['core.test.js'], 'unknown'), /Unknown test suite/)
})
