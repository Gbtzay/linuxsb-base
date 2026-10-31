import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { createSkinAsideCardsController } from '../plugins/skin/legacy-aside-cards.js'

function fixture(t, keep = {}) {
  const w = new JSDOM('<aside class="sidebar"></aside><div id="lsb-shell"><aside id="lsb-shell-aside"><section data-lsb-shell-site></section></aside></div>', { url: 'https://linux.sb/' }).window
  const document = w.document
  let sides = [document.querySelector('.sidebar')]
  const values = new Map([['asideKeep', keep]])
  const controller = createSkinAsideCardsController({
    window: w, document,
    store: { get: (key) => values.get(key), set: (key, value) => values.set(key, value) },
    getSidebars: () => sides, getPage: () => ({ type: 'home' }),
    isSelfUserCard: () => false, isEnabled: () => true, syncOnlineDots: () => {},
  })
  t.after(() => { controller.stop(); controller.restore(); controller.restorePersistent(); w.close() })
  return {
    w, document, controller, side: sides[0], host: document.querySelector('[data-lsb-shell-site]'),
    setSide: (side) => { sides = [side] },
    flush: () => new Promise((resolve) => w.setTimeout(resolve, 0)),
    card(className, text) {
      const node = document.createElement('section')
      node.className = `sidebar-card ${className}`
      node.textContent = text
      return node
    },
  }
}

// Treating the cached card as live would keep the stale card and hide the new one.
test('旧右栏缓存在线卡不阻止真实卡到达，并保持原节点和监听', async (t) => {
  const f = fixture(t, { online: '<section class="sidebar-card online-users-card">缓存人数</section>' })
  f.controller.adopt(f.host)
  assert.ok(f.host.querySelector('[data-lsb-aside-keep="online"]'))
  f.controller.watch()
  f.controller.watch()
  const online = f.card('online-users-card', '实时人数')
  let clicks = 0
  online.addEventListener('click', () => { clicks += 1 })
  f.side.append(online)
  await f.flush()
  assert.equal(f.host.querySelector('.online-users-card'), online)
  assert.equal(f.host.querySelector('[data-lsb-aside-keep="online"]'), null)
  assert.equal(online.parentNode, f.host)
  online.click()
  assert.equal(clicks, 1)
  f.controller.restore()
  assert.equal(online.parentNode, f.side)
  online.click()
  assert.equal(clicks, 2)
})

// Keeping the old observer would either react to the cached page or miss the new page.
test('旧右栏观察器重绑当前侧栏，停止后不再迁移晚到卡', async (t) => {
  const f = fixture(t)
  f.controller.watch()
  const next = f.document.createElement('aside')
  next.className = 'sidebar'
  f.document.body.append(next)
  f.setSide(next)
  f.controller.watch()
  next.innerHTML = '<section class="sidebar-card stats-card">新页统计</section>'
  await f.flush()
  const stats = f.host.querySelector('.stats-card')
  assert.ok(stats, '新侧栏的变更应被接管')
  f.controller.restore()
  const online = f.card('online-users-card', '新页在线')
  next.append(online)
  f.controller.watch()
  f.side.append(f.card('stats-card', '旧页变更'))
  await f.flush()
  assert.equal(online.parentNode, next, '旧侧栏变更不应触发新页扫描')
  next.append(f.document.createTextNode('更新'))
  await f.flush()
  assert.equal(online.parentNode, f.host)
  f.controller.stop()
  f.controller.restore()
  const late = f.card('daily-hot-topics-card', '停止后热帖')
  next.append(late)
  await f.flush()
  assert.equal(late.parentNode, next)
  assert.equal(f.host.children.length, 0)
})
