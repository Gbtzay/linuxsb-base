import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEvidenceSnapshot,
  diffEvidenceSnapshots,
  mergeCitationReview,
} from '../src/ai-evidence.js'

const scope = { kind: 'topic', routeType: 'topic', topicId: 7, routeScope: 'topic:7:1' }
const posts = [
  { topicId: 7, postId: 702, floor: 2, page: 1, authorName: '乙', content: '第二层正文' },
  { topicId: 7, postId: 701, floor: 1, page: 1, authorName: '甲', content: '第一层正文' },
  { topicId: 7, postId: 702, floor: 2, page: 1, authorName: '乙', content: '第二层正文' },
]

test('M14 evidence snapshot 对重复输入产生稳定指纹', () => {
  const first = buildEvidenceSnapshot(posts, scope)
  const second = buildEvidenceSnapshot([...posts].reverse(), scope)
  assert.equal(first.version, 1)
  assert.equal(first.materialFingerprint, second.materialFingerprint)
  assert.deepEqual(first.citations.map((row) => row.floor), [1, 2])
})

test('M14 evidence diff 识别正文、作者、楼层和分页变化', () => {
  const before = buildEvidenceSnapshot(posts, scope)
  const after = buildEvidenceSnapshot([
    { ...posts[0], content: '正文变化' },
    { ...posts[0], postId: 799, floor: 3, page: 2 },
  ], scope)
  const result = diffEvidenceSnapshots(before, after)
  assert.ok(result.counts.changed >= 1)
  assert.ok(result.counts.removed >= 1)
  assert.ok(result.rows.some((row) => row.status === 'changed' && row.reason === 'content'))
  const authorChanged = diffEvidenceSnapshots(
    buildEvidenceSnapshot([posts[0]], scope),
    buildEvidenceSnapshot([{ ...posts[0], authorName: '新作者' }], scope),
  )
  assert.ok(authorChanged.rows.some((row) => row.status === 'changed' && row.reason === 'author'))
})
test('M14 evidence 无效输入和复核失败不会变为 fresh', () => {
  const empty = buildEvidenceSnapshot([{ topicId: 7, floor: -1, page: 0, content: 'token=secret https://evil.example' }], scope)
  assert.equal(empty.citations.length, 0)
  const rows = mergeCitationReview(
    [{ key: 'topic:7:post:701', topicId: 7, postId: 701, floor: 1, freshness: 'fresh', contentFingerprint: 'old' }],
    { status: 'unverifiable', rows: [{ key: 'topic:7:post:701', reason: 'page-error' }] },
  )
  assert.equal(rows[0].freshness, 'unverifiable')
})

test('M14 evidence 范围缺失或变化采用 unverifiable', () => {
  const before = buildEvidenceSnapshot(posts, scope)
  const other = buildEvidenceSnapshot(posts, { ...scope, topicId: 8 })
  assert.equal(diffEvidenceSnapshots(before, other).status, 'unverifiable')
  assert.equal(diffEvidenceSnapshots(null, other).status, 'unverifiable')
})

