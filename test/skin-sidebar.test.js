import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const profileUrl = new URL('../plugins/skin/profile-controller.js', import.meta.url)
const siteUrl = new URL('../plugins/skin/site-cards-controller.js', import.meta.url)
const { createSkinProfileController } = existsSync(profileUrl) ? await import(profileUrl) : {}
const { createSkinSiteCardsController } = existsSync(siteUrl) ? await import(siteUrl) : {}

function fixture(t, kind = 'profile') {
  const create = kind === 'profile' ? createSkinProfileController : createSkinSiteCardsController
  assert.equal(typeof create, 'function', `${kind} 控制器应可独立验证`)
  const dom = new JSDOM(`<main><aside class="sidebar"><div id="before"></div><section id="native-profile" class="sidebar-card user-card"><a class="user-name" href="/user/12">本人</a><a href="/user/12?tab=notifications" title="原通知" aria-label="原标签">通知</a><input value="draft"><button>原生</button></section><section id="a" class="sidebar-card stats-card">统计</section><section id="b" class="sidebar-card online-users-card">在线</section><section id="promo" class="sidebar-card sidebar-promotions-card"><a data-sidebar-promotions-ad-link="1" style="--sidebar-promotion-text:white;--sidebar-promotion-background:black">奖励</a><form><input value="token"></form></section><section id="hot" class="sidebar-card daily-hot-topics-card">热帖</section><footer></footer></aside><div class="main-panel"><input value="body draft"></div></main><div id="legacy"></div><section id="self" data-canvas-profile-host hidden><button data-canvas-profile-expand>展开</button></section><div id="site"></div><div id="other"></div>`, { url: 'https://linux.sb/' })
  const { window } = dom
  const { document } = window
  const state = { page: { type: 'home' }, me: { uid: 12 }, self: document.getElementById('self'), width: 1440 }
  const controller = create({ window, document, getPage: () => state.page, getMe: () => state.me, getSidebars: () => [...document.querySelectorAll('aside.sidebar')], getSelfHost: () => state.self, getViewport: () => ({ width: state.width }) })
  t.after(() => { controller.restore({ releasePersistent: true }); window.close() })
  return { window, document, controller, state, side: document.querySelector('aside'), outlet: document.querySelector('main'), card: document.getElementById('native-profile'), host: document.getElementById('site') }
}

test('资料卡按同源完整用户路径区分本人、前缀用户和外站', (t) => {
  const { controller, card, state } = fixture(t)
  const link = card.querySelector('.user-name')
  for (const [href, expected] of [['/user/12', true], ['/user/12/?tab=posts', true], ['/user/123', false], ['https://other.example/user/12', false], ['/topic/12?next=/user/12', false]]) {
    link.setAttribute('href', href)
    assert.equal(controller.isSelfUserCard(card), expected, href)
  }
  state.me = { uid: 123 }
  link.setAttribute('href', '/user/123')
  assert.equal(controller.isSelfUserCard(card), true)
})

test('资料卡跨宿主重复接管仍恢复原节点、顺序和输入事件', (t) => {
  const { controller, document, side, card } = fixture(t)
  const siblings = [...side.children]
  let clicks = 0
  card.querySelector('button').addEventListener('click', () => clicks++)
  card.querySelector('input').value = 'unsaved'
  controller.adoptUserCard(document.getElementById('legacy'))
  controller.adoptUserCard(document.getElementById('other'))
  controller.adoptUserCard(document.getElementById('other'))
  controller.restoreUserCard()
  controller.restoreUserCard()
  assert.deepEqual([...side.children], siblings)
  assert.equal(card.querySelector('input').value, 'unsaved')
  card.querySelector('button').click()
  assert.equal(clicks, 1)
})

test('资料卡归还只使用持有节点，不误删同名 class 的其它节点', (t) => {
  const { controller, document, side, card } = fixture(t)
  controller.adoptUserCard(document.getElementById('legacy'))
  const decoy = document.createElement('section')
  decoy.className = 'lsb-shell-user-card'
  document.body.prepend(decoy)
  controller.restoreUserCard()
  assert.equal(card.parentNode, side)
  assert.equal(decoy.parentNode, document.body)
  assert.equal(decoy.className, 'lsb-shell-user-card')
})

test('单画布资料卡归还 ID 与通知属性，并清理旧展开按钮', (t) => {
  const { controller, document, outlet, card, side, state } = fixture(t)
  const bell = card.querySelector('[title]')
  const button = state.self.querySelector('button')
  controller.mount(outlet)
  assert.equal(card.parentNode, state.self)
  button.click()
  assert.equal(state.self.dataset.locked, 'true')
  controller.restore()
  assert.equal(card.parentNode, side)
  assert.equal(card.id, 'native-profile')
  assert.equal(bell.getAttribute('title'), '原通知')
  assert.equal(bell.getAttribute('aria-label'), '原标签')
  assert.equal(bell.hasAttribute('data-canvas-profile-bell'), false)
  const replacement = state.self.cloneNode(true)
  state.self.replaceWith(replacement)
  state.self = replacement
  controller.mount(outlet)
  button.click()
  assert.equal(replacement.dataset.locked, 'false')
  replacement.querySelector('button').click()
  assert.equal(replacement.dataset.locked, 'true')
  assert.equal(document.querySelectorAll('#lsb-canvas-self-profile-card').length, 1)
})

test('资料卡归还保留接管后外部更新的属性与既有标记', (t) => {
  const { controller, outlet, card } = fixture(t)
  card.classList.add('lsb-canvas-self-user-card')
  controller.mount(outlet)
  card.id = 'updated-by-site'
  card.querySelector('[title]').setAttribute('title', '新版通知')
  controller.mount(outlet)
  controller.restore()
  assert.equal(card.id, 'updated-by-site')
  assert.equal(card.querySelector('[title]').title, '新版通知')
  assert.equal(card.classList.contains('lsb-canvas-self-user-card'), true)
})

test('资料卡切换宿主后原位置不丢，失效原页不复活', (t) => {
  const { controller, document, outlet, card, state } = fixture(t)
  controller.mount(outlet)
  const next = document.createElement('section')
  next.setAttribute('data-canvas-profile-host', '')
  next.innerHTML = '<button data-canvas-profile-expand>展开</button>'
  document.body.append(next)
  state.self = next
  controller.mount(outlet)
  assert.equal(card.parentNode, next)
  outlet.remove()
  controller.restore()
  assert.equal(card.isConnected, false)
  assert.equal(document.querySelector('main'), null)
})

test('用户页本人卡与被访问者分开，列表节点和原标记可归还', (t) => {
  const { controller, document, outlet, side, card, state } = fixture(t)
  state.page = { type: 'user' }
  const visitor = card.cloneNode(true)
  visitor.id = 'visitor'
  visitor.querySelector('.user-name').href = '/user/123'
  side.append(visitor)
  const list = document.querySelector('.main-panel')
  list.setAttribute('data-lsb-canvas-list', 'native')
  controller.mount(outlet)
  assert.equal(card.parentNode, state.self)
  assert.equal(visitor.parentNode.getAttribute('data-lsb-canvas-profile'), '')
  assert.equal(document.querySelector('.main-panel'), list)
  controller.restore()
  assert.equal(visitor.parentNode, side)
  assert.equal(list.getAttribute('data-lsb-canvas-list'), 'native')
  assert.equal(outlet.querySelector('[data-canvas-profile-slot]'), null)
})

test('原生重建本人卡后采用新节点，不复活已移除的旧卡', (t) => {
  const { controller, outlet, card, side, state } = fixture(t)
  const fresh = card.cloneNode(true)
  fresh.id = 'fresh-profile'
  controller.mount(outlet)
  card.remove()
  side.append(fresh)
  controller.mount(outlet)
  assert.equal(fresh.parentNode, state.self)
  assert.equal(card.isConnected, false)
  controller.restore()
  assert.equal(fresh.parentNode, side)
  assert.equal(fresh.id, 'fresh-profile')
})

test('资料宿主被替换时保留其中的实际卡片，仍能归还原侧栏', (t) => {
  const { controller, document, outlet, card, side, state } = fixture(t)
  controller.mount(outlet)
  const replacement = document.createElement('section')
  replacement.setAttribute('data-canvas-profile-host', '')
  replacement.innerHTML = '<button data-canvas-profile-expand>展开</button>'
  state.self.replaceWith(replacement)
  state.self = replacement
  controller.mount(outlet)
  assert.equal(card.parentNode, replacement)
  controller.restore()
  assert.equal(card.parentNode, side)
})

for (const mode of ['legacy', 'ios27']) test(`${mode} 主动移除的资料卡在停用时不能复活`, (t) => {
  const { controller, document, outlet, card } = fixture(t)
  if (mode === 'legacy') controller.adoptUserCard(document.getElementById('legacy'))
  else controller.mount(outlet)
  card.remove()
  controller.restore()
  assert.equal(card.parentNode, null)
  assert.equal(card.isConnected, false)
})

test('站点卡片跨宿主移动后按原顺序归还，保留广告表单与事件', (t) => {
  const { controller, document, side, host } = fixture(t, 'site')
  const children = [...side.children]
  const promo = document.getElementById('promo')
  const form = promo.querySelector('form')
  let clicks = 0
  promo.querySelector('a').addEventListener('click', () => clicks++)
  controller.sync(host)
  controller.sync(document.getElementById('other'))
  assert.deepEqual([...document.getElementById('other').children].map((node) => node.id), ['a', 'b', 'promo', 'hot'])
  assert.equal(host.querySelector('.sidebar-card'), null)
  controller.sync(document.getElementById('other'))
  controller.restore({ releasePersistent: true })
  controller.restore({ releasePersistent: true })
  assert.deepEqual([...side.children], children)
  assert.equal(promo.querySelector('form'), form)
  promo.querySelector('a').click()
  assert.equal(clicks, 1)
  assert.equal(side.querySelectorAll('[data-lsb-canvas-site-origin]').length, 0)
})

test('站点卡片仅持久同步不移动普通卡，关闭浮层后可重新接管', (t) => {
  const { controller, document, host, side } = fixture(t, 'site')
  controller.sync(host, { persistentOnly: true })
  assert.deepEqual([...host.children].map((c) => c.id), ['promo', 'hot'])
  assert.equal(document.getElementById('a').parentNode, side)
  controller.restore({ restorePersistent: true })
  assert.equal(document.getElementById('promo').parentNode, side)
  controller.sync(host)
  assert.deepEqual([...host.children].map((c) => c.id), ['a', 'b', 'promo', 'hot'])
})

test('软跳响应占位重绑定保持同一广告节点，停用归还新页面', (t) => {
  const { controller, document, host, side } = fixture(t, 'site')
  const promo = document.getElementById('promo')
  controller.sync(host)
  const next = document.createElement('main')
  next.innerHTML = '<aside class="sidebar"><header></header><section class="sidebar-card sidebar-promotions-card">远程广告</section><section class="sidebar-card daily-hot-topics-card">远程热帖</section><footer></footer></aside>'
  controller.stageOrigins(next)
  assert.equal(next.querySelector('.sidebar-promotions-card'), null)
  side.parentNode.remove()
  document.body.append(next)
  controller.rebindOrigins(next)
  controller.sync(host)
  assert.equal(host.querySelector('.sidebar-promotions-card'), promo)
  controller.restore({ releasePersistent: true })
  assert.equal(next.querySelector('.sidebar-promotions-card'), promo)
  assert.deepEqual([...next.querySelector('aside').children].map((n) => n.tagName), ['HEADER', 'SECTION', 'SECTION', 'FOOTER'])
})

test('未初始化广告副本不替代原生节点，原节点丢失后接管初始化重建卡', (t) => {
  const { controller, document, host, side } = fixture(t, 'site')
  const promo = document.getElementById('promo')
  controller.sync(host, { persistentOnly: true })
  const raw = promo.cloneNode(true)
  raw.querySelector('a').removeAttribute('style')
  side.append(raw)
  controller.sync(host, { persistentOnly: true })
  assert.equal(raw.isConnected, false)
  assert.equal(host.querySelector('.sidebar-promotions-card'), promo)
  promo.remove()
  const rebuilt = promo.cloneNode(true)
  side.append(rebuilt)
  controller.sync(host, { persistentOnly: true })
  assert.equal(host.querySelector('.sidebar-promotions-card'), rebuilt)
  controller.restore({ releasePersistent: true })
  assert.equal(rebuilt.parentNode, side)
})

test('普通站点卡原页面消失时归还不复活旧页，也不删除未接管节点', (t) => {
  const { controller, document, host, side } = fixture(t, 'site')
  const card = document.getElementById('a')
  controller.sync(host)
  const foreign = document.createElement('section')
  foreign.className = 'sidebar-card'
  host.append(foreign)
  side.parentNode.remove()
  controller.restore({ releasePersistent: true })
  assert.equal(card.isConnected, false)
  assert.equal(document.querySelector('main'), null)
  assert.equal(foreign.parentNode, host)
})

test('被原生移除的普通卡片不复活，原占位也须清理', (t) => {
  const { controller, document, side, host } = fixture(t, 'site')
  const card = document.getElementById('a')
  controller.sync(host)
  card.remove()
  controller.sync(host)
  controller.restore({ releasePersistent: true })
  assert.equal(card.isConnected, false)
  assert.equal([...side.childNodes].filter((node) => node.nodeType === 8).length, 0)
})
