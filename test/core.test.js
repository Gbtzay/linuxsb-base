/** 基座整体行为：启动、插件生命周期、权限、依赖解析、UI 挂载 */
import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

let Core
let VERSION

// 夹具只读一次（146KB HTML × 每用例重新读盘是主要耗时之一）
const FX = {
  'topic1.html': readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8'),
  'home.html': readFileSync(new URL('./fixtures/home.html', import.meta.url), 'utf8'),
  'user1.html': readFileSync(new URL('./fixtures/user1.html', import.meta.url), 'utf8'),
  'user-replies.html': readFileSync(new URL('./fixtures/user-replies.html', import.meta.url), 'utf8'),
}

function installDom(name = 'topic1.html', url = 'https://linux.sb/topic/1') {
  const dom = new JSDOM(FX[name], { url })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  globalThis.location = w.location
  globalThis.localStorage = w.localStorage
  globalThis.MutationObserver = w.MutationObserver
  globalThis.DOMParser = w.DOMParser
  globalThis.FormData = w.FormData
  // 不用 pretendToBeVisual（其 rAF 循环会拖住事件循环），手动给个立即执行的 shim
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  globalThis.CustomEvent = w.CustomEvent
  w.localStorage.clear()
  return w
}

before(async () => {
  installDom()
  const mod = await import('../src/core.js')
  Core = mod.Core
  VERSION = mod.VERSION
})

beforeEach(() => {
  installDom()
  delete globalThis.__LSB_CHANNEL__
  delete globalThis.__LSB_LTS_VERSION__
  if (globalThis.window) {
    delete globalThis.window.__LSB_CHANNEL__
    delete globalThis.window.__LSB_LTS_VERSION__
  }
})

function boot() {
  const core = new Core()
  core.boot()
  return core
}

test('Core 不保留未使用的构造选项字段', () => {
  const core = new Core()
  assert.equal(Object.hasOwn(core, '_opts'), false)
  core.shutdown()
})

test('启动后 snapshot / csrf / 面板就绪', () => {
  const core = boot()
  assert.equal(core.ready, true)
  assert.equal(core.snapshot.page.type, 'topic')
  assert.equal(core.snapshot.me.uid, 5372)
  assert.ok(core.net.csrf())
  // 核心自带四个面板页（日志页 order=2，检查更新 order=3）
  assert.deepEqual(
    core.ui._tabs.map((t) => t.id),
    ['__core_plugins', '__core_settings', '__core_logs', '__core_updates'],
  )
  const launch = document.querySelector('.lsb-launcher')
  assert.ok(launch, '右下角入口已挂载')
  assert.equal(launch.textContent, 'H')
  assert.match(launch.title, /氢/)
})

test('Platform v2：插件获得脱敏能力上下文，网络与动作 facade 共享 broker', async () => {
  const core = boot()
  let api
  core.register({ id: 'runtime-probe', version: '1.0.0', permissions: ['read', 'storage'] }, (value) => {
    api = value
  })
  assert.deepEqual(api.runtime.context(), { owner: 'runtime-probe', capabilities: ['read', 'storage'] })
  assert.equal(typeof core.requestBroker.request, 'function')
  assert.equal(typeof core.actionBroker.prepare, 'function')
  assert.equal('csrf' in api.runtime.context(), false)
  assert.throws(
    () => api.net.raw('/reply_edit', { method: 'POST', body: { body: 'x' } }),
    (error) => error.code === 'capability.denied' && error.capability === 'write',
  )
  core.shutdown()
})

test('插件网络层暴露同源重定向最终地址而非原请求路径', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    status: 200,
    ok: true,
    url: 'https://linux.sb/login',
    headers: { forEach() {} },
    text: async () => '<!doctype html><title>login</title>',
  })
  const core = boot()
  let api
  core.register({ id: 'redirect-probe', version: '1.0.0', permissions: ['read'] }, (value) => {
    api = value
  })
  try {
    const result = await api.net.raw('/forum/4', { queue: false, retry: 0 })
    assert.equal(result.url, 'https://linux.sb/login')
    assert.equal(result.finalUrl, undefined, '内部重定向字段不向插件暴露')
  } finally {
    core.shutdown()
    globalThis.fetch = originalFetch
  }
})

test('插件并发读取相同页面只发送一个 GET，各自获得可独立修改的 Document', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  let release
  const held = new Promise((resolve) => { release = resolve })
  globalThis.fetch = async (url) => {
    calls++
    await held
    return { status: 200, ok: true, url: String(url), headers: { forEach() {} }, text: async () => '<h1>shared</h1>' }
  }
  const core = boot()
  let api
  core.register({ id: 'dedup-probe', permissions: ['read'] }, (value) => { api = value })
  try {
    const pending = [api.net.doc('/topic/2', { queue: false }), api.net.doc('/topic/2', { queue: false })]
    release()
    const [a, b] = await Promise.all(pending)
    assert.equal(calls, 1)
    assert.equal(a.querySelector('h1').textContent, 'shared')
    a.querySelector('h1').textContent = 'changed'
    assert.equal(b.querySelector('h1').textContent, 'shared')
  } finally {
    core.shutdown()
    globalThis.fetch = originalFetch
  }
})

test('正式版氢号是 2.4.2，面板标题不带 RC', () => {
  assert.equal(VERSION, '2.4.2')
  const core = boot()
  assert.equal(core.ui.title, 'LINUX.SB · 氢')
  assert.doesNotMatch(core.ui.title, /RC/)
  core.ui.openPanel()
  assert.match(document.querySelector('.lsb-panel-head').textContent, /LINUX\.SB · 氢/)
  assert.doesNotMatch(document.querySelector('.lsb-panel-head').textContent, /RC/)
})

test('插件激活并收到 sticky 的 site:ready', () => {
  const core = boot()
  let readyPayload = null
  core.register({ id: 'p1', name: '插件一', version: '1.0.0' }, (api) => {
    api.on('site:ready', (snap) => {
      readyPayload = snap
    })
    return { hello: () => 'hi' }
  })
  const rec = core.plugins.get('p1')
  assert.equal(rec.state, 'active')
  assert.equal(readyPayload.page.type, 'topic', '晚注册也能拿到启动快照')
  assert.equal(rec.exports.hello(), 'hi')
})

test('注册顺序无关：依赖后注册也能激活', () => {
  const core = boot()
  const order = []
  core.register(
    { id: 'child', version: '1.0.0', requires: { plugins: { parent: '^2.0.0' } } },
    (api) => {
      order.push('child')
      assert.equal(api.plugin('parent').answer, 42)
    },
  )
  assert.equal(core.plugins.get('child').state, 'registered', '依赖缺失时挂起，不报错')
  core.register({ id: 'parent', version: '2.1.0' }, () => {
    order.push('parent')
    return { answer: 42 }
  })
  assert.deepEqual(order, ['parent', 'child'])
  assert.equal(core.plugins.get('child').state, 'active')
})

test('依赖版本不满足 → 标记 error 且不执行', () => {
  const core = boot()
  core.register({ id: 'parent', version: '1.0.0' }, () => ({}))
  let ran = false
  core.register({ id: 'child', version: '1.0.0', requires: { plugins: { parent: '^2.0.0' } } }, () => {
    ran = true
  })
  assert.equal(ran, false)
  assert.equal(core.plugins.get('child').state, 'error')
  assert.match(core.plugins.get('child').error, /需要 \^2\.0\.0，实际 1\.0\.0/)
})

test('基座版本不匹配 → 拒绝激活', () => {
  const core = boot()
  core.register({ id: 'future', version: '1.0.0', requires: { base: '^9.0.0' } }, () => {
    throw new Error('不该执行')
  })
  assert.equal(core.plugins.get('future').state, 'error')
  assert.match(core.plugins.get('future').error, /需要基座 \^9\.0\.0/)
})

test('2.x 氢兼容旧 0.1.x/0.2.x 插件声明', () => {
  const core = boot()
  let ran01 = false
  let ran02 = false
  core.register({ id: 'legacy-01', version: '1.0.0', requires: { base: '^0.1.0' } }, () => {
    ran01 = true
  })
  core.register({ id: 'legacy-02', version: '1.0.0', requires: { base: '^0.2.3' } }, () => {
    ran02 = true
  })
  assert.equal(ran01, true)
  assert.equal(ran02, true)
  assert.equal(core.plugins.get('legacy-01').state, 'active')
  assert.equal(core.plugins.get('legacy-02').state, 'active')
})

test('pages 限定：不匹配页面直接跳过', () => {
  const core = boot() // topic 页
  let ran = false
  core.register({ id: 'homeonly', version: '1.0.0', pages: ['home'] }, () => {
    ran = true
  })
  assert.equal(ran, false)
  assert.equal(core.plugins.get('homeonly').state, 'skipped')
})

test('权限：未声明 write 时调用动作被拒绝', async () => {
  const core = boot()
  let api
  core.register({ id: 'reader', version: '1.0.0', permissions: ['read', 'events'] }, (a) => {
    api = a
  })
  assert.throws(() => api.actions.reply(1, 'hi'), /未声明 'write' 权限/)
  assert.throws(() => api.net.raw('/reply_edit', { method: 'POST', body: 'x' }), /未声明 'write' 权限/)
  assert.throws(() => api.store.set('k', 1), /未声明 'storage' 权限/)
  assert.throws(() => api.ui.toast('x'), /未声明 'ui' 权限/)
})

test('插件停用自动中止基座网络请求', async () => {
  localStorage.setItem('lsb_base:__core:rate', JSON.stringify(0))
  const previousFetch = globalThis.fetch
  let release
  let started = false
  const held = new Promise((resolve) => { release = resolve })
  globalThis.fetch = async (url) => {
    started = true
    await held
    return { status: 200, ok: true, url: String(url), text: async () => '<html></html>' }
  }
  const core = boot()
  let api
  core.register({ id: 'abort-probe', version: '1.0.0', permissions: ['read', 'events'] }, (value) => {
    api = value
  })
  const request = api.net.doc('/topic/1', { queue: false })
  for (let i = 0; i < 30 && !started; i++) await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(started, true, '请求应已进入 fetch')
  const rejection = assert.rejects(request, { name: 'AbortError' })
  core.disable('abort-probe')
  release()
  await rejection
  assert.equal(api.signal.aborted, true, '插件生命周期 signal 应在停用时 abort')
  core.shutdown()
  globalThis.fetch = previousFetch
})

test('权限：声明后可用，且存储按插件隔离', () => {
  const core = boot()
  let a1
  let a2
  core.register({ id: 'pa', version: '1.0.0' }, (a) => {
    a1 = a
  })
  core.register({ id: 'pb', version: '1.0.0' }, (a) => {
    a2 = a
  })
  a1.store.set('shared', 'from-pa')
  a2.store.set('shared', 'from-pb')
  assert.equal(a1.store.get('shared'), 'from-pa')
  assert.equal(a2.store.get('shared'), 'from-pb')
  assert.deepEqual(a1.store.keys(), ['shared'])
})

test('M15 shellAsideSelect 只选择已注册视图并对未知 ID 回退 site', () => {
  const core = boot()
  let api
  core.register({ id: 'aside-probe', version: '1.0.0', permissions: ['ui'] }, (a) => {
    api = a
  })
  assert.equal(api.ui.shellAsideSelect('unknown'), 'site')
  assert.equal(api.ui.shellAsideSelect('site'), 'site')
})

test('热路径：api.me / api.forums 连续读取不重新深拷贝', () => {
  const core = boot()
  let api
  core.register({ id: 'hotread', version: '1.0.0' }, (a) => {
    api = a
  })
  assert.equal(api.me, api.me, '同一快照内 me 是同一引用')
  assert.equal(api.forums, api.forums, '同一快照内 forums 是同一引用')
  assert.equal(api.me.uid, 5372)
})

test('config：默认值合并 + 保存 + 变更事件', () => {
  const core = boot()
  let api
  core.register(
    {
      id: 'cfg',
      version: '1.0.0',
      config: {
        enabled: { type: 'switch', label: '启用', default: true },
        limit: { type: 'number', label: '条数', default: 20 },
      },
    },
    (a) => {
      api = a
    },
  )
  assert.deepEqual(api.config(), { enabled: true, limit: 20 })
  let changed = null
  core.bus.on('config:changed:cfg', (v) => {
    changed = v
  })
  api.saveConfig({ limit: 5 })
  assert.deepEqual(api.config(), { enabled: true, limit: 5 }, '未改的键保留默认值')
  assert.deepEqual(changed, { limit: 5 })
})

test('插件间 RPC 与命名空间事件', async () => {
  const core = boot()
  core.register({ id: 'provider', version: '1.0.0', provides: ['user:score'] }, (api) => {
    api.handle('user:score', ({ uid }) => ({ uid, score: uid + 1 }))
  })
  let heard = null
  core.register({ id: 'consumer', version: '1.0.0' }, (api) => {
    api.on('metrics:updated', (p) => {
      heard = p
    })
  })
  const provider = core.plugins.get('provider')
  assert.equal(core.bus.hasHandler('user:score'), true)
  assert.deepEqual(await core.bus.request('user:score', { uid: 1 }), { uid: 1, score: 2 })

  // 生产者广播全局事件
  core.bus.emit('metrics:updated', { n: 3 }, { source: 'provider' })
  assert.deepEqual(heard, { n: 3 })
  assert.equal(provider.state, 'active')
})

test('api.parse.userReplies 向插件暴露纯解析器且不需要权限', () => {
  const core = boot()
  let api
  core.register({ id: 'reply-parser', version: '1.0.0' }, (value) => {
    api = value
  })
  const replyDoc = new JSDOM(FX['user-replies.html'], { url: 'https://linux.sb/user/5372?tab=replies' }).window.document
  assert.deepEqual(api.parse.userReplies(replyDoc), [{ postId: 8102, topicId: 4321, topicTitle: '主题标题' }])
  assert.equal(api.routes.topicReply(4321, 8102), '/topic/4321?replyid=8102')
})

test('api.parse.topicFavoriteState 向只读插件暴露本地三态解析器', () => {
  const core = boot()
  let api
  core.register({ id: 'favorite-parser', version: '1.0.0', permissions: ['read'] }, (value) => { api = value })
  const favoriteDoc = new JSDOM('<form class="topic-favorites-action" method="post" action="/topic_favorite"><button class="fav-btn" aria-label="收藏"><span>收藏</span></button></form>', { url: 'https://linux.sb/topic/1' }).window.document
  assert.equal(api.parse.topicFavoriteState(favoriteDoc), false)
  assert.equal(typeof api.parse.topicFavoriteState, 'function', '只读插件可直接使用本地纯解析器')
})

test('侧栏视图：按 order 排序，visible 过滤，注销后不再提供', () => {
  const core = boot()
  let api
  core.register({ id: 'aside-provider', version: '1.0.0' }, (a) => {
    api = a
    a.ui.shellAsideView({ id: 'late', label: '晚', order: 20, visible: () => true, render: () => {} })
    a.ui.shellAsideView({ id: 'early', label: '早', order: 10, visible: () => false, render: () => {} })
  })
  assert.deepEqual(core.ui.shellAsideViews({}).map((view) => view.id), ['late'])
  assert.equal(core.ui.shellAsideViews({})[0].label, '晚')
  api.ui.shellAsideView({ id: 'second', label: '第二', order: 20, render: () => {} })
  assert.deepEqual(core.ui.shellAsideViews({}).map((view) => view.id), ['second', 'late'])
})

test('窗口视图：按 order 排序，visible 过滤，注销后不再提供', () => {
  const core = boot()
  let api
  core.register({ id: 'window-provider', version: '1.0.0', permissions: ['ui'] }, (a) => {
    api = a
    a.ui.shellWindowRegister({ id: 'late-window', label: '晚', order: 20, visible: () => true, render: () => {} })
    a.ui.shellWindowRegister({ id: 'hidden-window', label: '隐藏', order: 10, visible: () => false, render: () => {} })
  })
  assert.deepEqual(core.ui.shellWindows({}).map((view) => view.id), ['late-window'])
  const dispose = api.ui.shellWindowRegister({ id: 'early-window', label: '早', order: 10, render: () => {} })
  assert.deepEqual(core.ui.shellWindows({}).map((view) => view.id), ['early-window', 'late-window'])
  dispose()
  assert.deepEqual(core.ui.shellWindows({}).map((view) => view.id), ['late-window'])
})

test('窗口控制器：focus/arrange/reset/layout 和滚动根都安全委托', () => {
  const core = boot()
  let api
  const root = document.createElement('main')
  core.register({ id: 'window-controller', version: '1.0.0', permissions: ['ui'] }, (a) => {
    api = a
    a.ui.shellWindowController((action, value) => {
      if (action === 'focus') return `focused:${value}`
      if (action === 'arrange') return { arranged: true }
      if (action === 'reset') return { reset: value || 'all' }
      if (action === 'layout') return { version: 1 }
      return null
    })
    a.ui.shellScrollRootController(() => root)
  })
  assert.equal(api.ui.shellWindowFocus('content'), 'focused:content')
  assert.deepEqual(api.ui.shellWindowArrange(), { arranged: true })
  assert.deepEqual(api.ui.shellWindowReset(), { reset: 'all' })
  assert.deepEqual(api.ui.shellWindowLayout(), { version: 1 })
  assert.strictEqual(api.ui.shellScrollRoot(), root)
  assert.equal(api.ui.shellLayout.widthBucket(1100), 'wide')
  assert.equal(typeof api.ui.shellLayout.sanitizeShellLayout, 'function')
})

test('窗口 API 未声明 ui 权限时拒绝调用', () => {
  const core = boot()
  let api
  core.register({ id: 'window-reader', version: '1.0.0', permissions: ['read'] }, (a) => { api = a })
  assert.throws(() => api.ui.shellWindows(), /未声明 'ui' 权限/)
  assert.throws(() => api.ui.shellWindowRegister({ id: 'x', render: () => {} }), /未声明 'ui' 权限/)
})

test('动作提供方停用后注销，未声明 read/ui 权限不能登记对应动作', () => {
  const core = boot()
  let api
  core.register({ id: 'action-provider', version: '1.0.0', permissions: ['events'] }, (a) => {
    api = a
  })
  assert.throws(
    () => api.ai.registerAction({ id: 'x.read', version: 1, permission: 'read', execute: () => ({}), preview: () => '' }),
    /未声明 'read'/,
  )
  core.register({ id: 'good-provider', version: '1.0.0', permissions: ['read', 'ui', 'events'] }, (a) => {
    a.ai.registerAction({ id: 'ui.test', version: 1, permission: 'ui', execute: () => ({ ok: true }), preview: () => '测试' })
  })
  assert.equal(core.ai.actions({}).some((x) => x.id === 'ui.test'), true)
  core.disable('good-provider')
  assert.equal(core.ai.actions({}).some((x) => x.id === 'ui.test'), false)
})

test('未声明依赖时不能偷看别人的 exports', () => {
  const core = boot()
  core.register({ id: 'secret', version: '1.0.0' }, () => ({ token: 'x' }))
  let api
  core.register({ id: 'nosy', version: '1.0.0' }, (a) => {
    api = a
  })
  assert.throws(() => api.plugin('secret'), /未在 requires\.plugins 声明依赖/)
})

test('setup 抛错 → 隔离为 error，其它插件照常', () => {
  const core = boot()
  let okRan = false
  core.register({ id: 'bad', version: '1.0.0' }, () => {
    throw new Error('炸了')
  })
  core.register({ id: 'good', version: '1.0.0' }, () => {
    okRan = true
  })
  assert.equal(core.plugins.get('bad').state, 'error')
  assert.equal(core.plugins.get('bad').error, '炸了')
  assert.equal(okRan, true)
})

test('停用插件会清理其监听与 RPC', () => {
  const core = boot()
  let calls = 0
  let disposed = false
  core.register({ id: 'noisy', version: '1.0.0' }, (api) => {
    api.on('ping', () => calls++)
    api.handle('noisy:cap', () => 1)
    api.onDispose(() => {
      disposed = true
    })
  })
  core.bus.emit('ping')
  assert.equal(calls, 1)
  core.disable('noisy')
  core.bus.emit('ping')
  assert.equal(calls, 1, '停用后不再收到事件')
  assert.equal(core.bus.hasHandler('noisy:cap'), false)
  assert.equal(disposed, true)
  assert.equal(core.plugins.get('noisy').state, 'disabled')
})

test('AI trace API 只发布已脱敏事件，停用后清理监听', () => {
  const core = boot()
  const seen = []
  let traceApi
  core.register({ id: 'trace-listener', version: '1.0.0' }, (api) => {
    api.on('ai:trace', (event) => seen.push(event))
  })
  core.register({ id: 'trace-producer', version: '1.0.0' }, (api) => {
    traceApi = api.ai.trace
  })

  const result = traceApi.emit({
    id: 'event-1',
    flowId: 'flow-1',
    stage: 'read',
    state: 'complete',
    title: '读取',
    summary: '已读取当前列表',
    evidence: 'verified',
    counts: { selected: 0, read: 2, matched: 1, citations: 1 },
    citations: ['floor-1'],
    csrf: 'secret',
    html: '<body>private</body>',
  })
  assert.equal(result.ok, true)
  assert.equal(seen.length, 1)
  assert.equal('csrf' in seen[0], false)
  assert.equal('html' in seen[0], false)
  assert.deepEqual(seen[0].counts, { selected: 0, read: 2, matched: 1, citations: 1 })

  core.disable('trace-listener')
  traceApi.emit({
    id: 'event-2', flowId: 'flow-1', stage: 'answer', state: 'active',
    title: '回答', summary: '处理中', evidence: 'partial',
  })
  assert.equal(seen.length, 1, '停用后不应继续收到 trace 事件')
})

test('停用状态持久化，重启后不再激活；启用后恢复', () => {
  const core = boot()
  core.register({ id: 'persist', version: '1.0.0' }, () => {})
  core.disable('persist')

  const core2 = new Core() // 复用同一 localStorage
  core2.boot()
  let ran = false
  core2.register({ id: 'persist', version: '1.0.0' }, () => {
    ran = true
  })
  assert.equal(ran, false)
  assert.equal(core2.plugins.get('persist').state, 'disabled')
  core2.enable('persist')
  assert.equal(ran, true)
  assert.equal(core2.plugins.get('persist').state, 'active')
})

test('DOM 监听：现有元素与新增元素都回调一次', async () => {
  const core = boot()
  const seen = []
  core.register({ id: 'domp', version: '1.0.0' }, (api) => {
    api.dom.each('li.post-entry', (el) => seen.push(el.id))
  })
  const existing = seen.length
  assert.ok(existing > 40, `现有楼层 ${existing}`)

  const li = document.createElement('li')
  li.className = 'post-item post-entry'
  li.id = 'post-99999'
  li.innerHTML = '<div class="post-content">新回复</div><div class="post-ops"></div>'
  document.querySelector('ul.topic-post-list').appendChild(li)

  await new Promise((r) => setTimeout(r, 12))
  assert.equal(seen.length, existing + 1)
  assert.equal(seen.at(-1), 'post-99999')
})

test('AJAX 新楼层被归一成 topic:posts-added', async () => {
  const core = boot()
  const got = []
  core.register({ id: 'watch', version: '1.0.0' }, (api) => {
    api.on('topic:posts-added', (posts) => got.push(...posts))
  })
  const li = document.createElement('li')
  li.className = 'post-item post-entry'
  li.id = 'post-12345'
  li.dataset.floor = '51'
  li.innerHTML =
    '<a class="post-title post-author" href="/user/777">someone</a>' +
    '<span data-performance-time="1786074099">刚刚</span>' +
    '<div class="post-content"><p>沙发</p></div>'
  document.querySelector('ul.topic-post-list').appendChild(li)
  await new Promise((r) => setTimeout(r, 12))
  assert.equal(got.length, 1)
  assert.equal(got[0].postId, 12345)
  assert.equal(got[0].floor, 51)
  assert.equal(got[0].authorId, 777)
  assert.equal(got[0].content, '沙发')
})

test('设置目录只列出有 schema 的插件，独立设置入口绕过同 ID 功能页', () => {
  const core = boot()
  let api
  let setupRan = false
  core.register(
    {
      id: 'same-settings',
      name: '同 ID 插件',
      version: '1.0.0',
      config: { limit: { type: 'number', label: '数量上限', default: 3 } },
    },
    (pluginApi) => {
      api = pluginApi
      pluginApi.ui.configTab({
        name: '同 ID 自定义设置',
        render: (host) => {
          const custom = document.createElement('div')
          custom.id = 'same-settings-custom-section'
          custom.textContent = '插件自定义设置'
          host.append(custom)
        },
      })
      pluginApi.ui.tab({
        name: '功能面板',
        render: (host) => { host.innerHTML = '<div id="same-settings-feature">功能内容</div>' },
      })
    },
  )
  core.register(
    {
      id: 'skipped-settings',
      name: '跳过的配置插件',
      version: '1.0.0',
      pages: ['home'],
      config: { enabled: { type: 'switch', label: '启用', default: true } },
    },
    () => { setupRan = true },
  )
  core.register({ id: 'no-settings', name: '无设置插件', version: '1.0.0' }, () => {})

  assert.deepEqual(api.ui.settingsPlugins(), [
    { id: 'same-settings', name: '同 ID 插件', state: 'active' },
    { id: 'skipped-settings', name: '跳过的配置插件', state: 'skipped' },
  ])
  assert.equal(setupRan, false, '按页面跳过的插件仍能出现在设置目录')

  core.ui.openPanel('same-settings')
  assert.ok(document.querySelector('#same-settings-feature'), '旧功能页 ID 仍指向功能面板')
  api.ui.openPluginSettings('same-settings')
  assert.equal(document.querySelector('#same-settings-feature'), null)
  assert.match(document.querySelector('.lsb-view').textContent, /数量上限/)
  assert.ok(document.querySelector('#same-settings-custom-section'), '独立设置表单保留插件追加的设置内容')
  const input = document.querySelector('.lsb-view input[type="number"]')
  assert.ok(input)
  input.value = '8'
  document.querySelector('.lsb-view .lsb-btn.is-primary').click()
  assert.equal(api.config().limit, 8, '独立表单保存到插件配置')

  assert.throws(() => api.ui.openPluginSettings('no-settings'), /未声明配置项/)
  assert.throws(() => api.ui.openPluginSettings('missing-settings'), /不存在/)

  let restrictedApi
  core.register({ id: 'without-ui', permissions: ['read'], version: '1.0.0' }, (pluginApi) => {
    restrictedApi = pluginApi
  })
  assert.throws(() => restrictedApi.ui.settingsPlugins(), /ui/)
  assert.throws(() => restrictedApi.ui.openPluginSettings('same-settings'), /ui/)
})

test('UI：插件注册设置页 + toast + 楼层按钮', () => {
  const core = boot()
  core.register({ id: 'uip', name: 'UI 插件', version: '1.0.0' }, (api) => {
    api.ui.tab({
      name: '我的页',
      render: (host) => {
        host.innerHTML = '<div id="mine">内容</div>'
      },
    })
    api.ui.toast('已加载', { type: 'success' })
    const post = document.querySelector('li.post-entry .post-ops')?.closest('li.post-entry')
    api.ui.postAction(post, { label: '标记', onClick: () => {} })
  })
  assert.ok(document.querySelector('.lsb-toast'))
  assert.ok(document.querySelector('.lsb-ops .lsb-op'))
  core.ui.openPanel('uip')
  assert.ok(document.querySelector('#mine'), '插件面板渲染成功')
  assert.equal(core.ui._active, 'uip')
  core.ui.closePanel()
  assert.equal(document.querySelector('.lsb-panel'), null)
})

test('同一插件的两个 Tab 可独立选中，不会双高亮或抢内容', () => {
  const core = boot()
  core.register(
    {
      id: 'dual',
      name: '双页插件',
      version: '1.0.0',
      config: { n: { type: 'number', label: '巡检间隔', default: 3 } },
    },
    (api) => {
      api.ui.tab({
        id: 'dual-inbox',
        name: '消息箱',
        order: 63,
        render: (host) => {
          host.innerHTML = '<div id="inbox-view">收件箱内容</div>'
        },
      })
      api.ui.configTab({ name: '哨兵设置', order: 55 })
    },
  )
  core.ui.openPanel('dual')

  const btnOf = (name) => [...document.querySelectorAll('.lsb-tab')].find((b) => b.textContent === name)
  const inboxBtn = btnOf('消息箱')
  const cfgBtn = btnOf('哨兵设置')
  assert.ok(inboxBtn && cfgBtn, '两个选项卡都应出现')

  inboxBtn.click()
  assert.ok(document.querySelector('#inbox-view'), '消息箱应渲染自己的内容')
  assert.ok(btnOf('消息箱').classList.contains('is-active'))
  assert.equal(btnOf('哨兵设置').classList.contains('is-active'), false, '哨兵设置不应同时高亮')

  btnOf('哨兵设置').click()
  assert.match(document.querySelector('.lsb-view').textContent, /巡检间隔/)
  assert.equal(document.querySelector('#inbox-view'), null)
  assert.ok(btnOf('哨兵设置').classList.contains('is-active'))
  assert.equal(btnOf('消息箱').classList.contains('is-active'), false, '消息箱不应同时高亮')
})

test('UI 里的站内文本会被转义，防止昵称注入', () => {
  const core = boot()
  core.ui.toast('<img src=x onerror=alert(1)>')
  const el = document.querySelector('.lsb-toast')
  assert.equal(el.querySelector('img'), null)
  assert.match(el.innerHTML, /&lt;img/)
})

test('面板渲染出错不影响基座', () => {
  const core = boot()
  core.register({ id: 'badui', version: '1.0.0' }, (api) => {
    api.ui.tab({
      name: '坏页',
      render: () => {
        throw new Error('渲染炸了')
      },
    })
  })
  core.ui.openPanel('badui')
  assert.match(document.querySelector('.lsb-view').textContent, /面板渲染失败/)
  core.ui.closePanel()
})

test('带 config 的 pages 限定插件：非适用页仍能打开设置', () => {
  installDom('home.html', 'https://linux.sb/')
  const core = boot()
  let setupRan = false
  core.register(
    {
      id: 'paged-cfg',
      name: '分页插件',
      version: '1.0.0',
      pages: ['topic'],
      config: { n: { type: 'number', label: '阈值', default: 3 } },
    },
    () => {
      setupRan = true
    },
  )
  assert.equal(core.plugins.get('paged-cfg').state, 'skipped')
  assert.equal(setupRan, false, '首页不应跑帖子页插件的 setup')
  core.ui.openPanel('paged-cfg')
  const names = [...document.querySelectorAll('.lsb-tab')].map((b) => b.textContent)
  assert.ok(names.includes('分页插件'), `设置侧栏应有配置页，实际：${names.join('/')}`)
  assert.match(document.querySelector('.lsb-view').textContent, /阈值/)
  core.ui.closePanel()
})

test('设置面板有固定高度类，切 Tab 不靠内容撑开', () => {
  const core = boot()
  core.register({ id: 'shortp', version: '1.0.0' }, (api) => {
    api.ui.tab({ name: '短页', render: (host) => { host.innerHTML = '<div>少</div>' } })
  })
  core.ui.openPanel('shortp')
  const panel = document.querySelector('.lsb-panel')
  assert.ok(panel.classList.contains('lsb-panel-settings'), '设置面板应固定尺寸')
  const css = document.getElementById('lsb-base-style')?.textContent || ''
  assert.match(css, /\.lsb-panel-settings\{[^}]*height:/)
  core.ui.closePanel()
})

test('设置面板滚到底不再带动后面的页面', () => {
  const core = boot()
  core.register({ id: 'longp', version: '1.0.0' }, (api) => {
    api.ui.tab({
      name: '长页',
      render: (host) => {
        host.innerHTML = '<div style="height:4000px">长</div>'
      },
    })
  })
  core.ui.openPanel('longp')
  const css = document.getElementById('lsb-base-style')?.textContent || ''
  assert.match(css, /\.lsb-view\{[^}]*overscroll-behavior:\s*contain/, '内容区截住滚动链')
  const head = document.querySelector('.lsb-panel-head')
  const ev = new window.WheelEvent('wheel', { deltaY: 80, bubbles: true, cancelable: true })
  head.dispatchEvent(ev)
  assert.equal(ev.defaultPrevented, true, '滚在面板头上也不应带动主页')
  const mask = document.querySelector('.lsb-mask')
  const ev2 = new window.WheelEvent('wheel', { deltaY: 80, bubbles: true, cancelable: true })
  mask.dispatchEvent(ev2)
  assert.equal(ev2.defaultPrevented, true, '遮罩上滚动不应带动主页')
  core.ui.closePanel()
})

test('info() 汇报插件与能力清单', () => {
  const core = boot()
  core.register({ id: 'x', name: 'X', version: '1.2.3' }, (api) => {
    api.handle('x:do', () => {})
  })
  const info = core.info()
  assert.equal(info.version, VERSION)
  assert.equal(info.page.type, 'topic')
  assert.deepEqual(info.plugins.find((p) => p.id === 'x').state, 'active')
  assert.ok(info.handlers.some((h) => h.name === 'x:do' && h.owner === 'x'))
  assert.throws(() => {
    info.version = 'hack'
  }, TypeError, 'info 应为冻结对象')
})

test('重复 id 注册被忽略', () => {
  const core = boot()
  let n = 0
  core.register({ id: 'dup', version: '1.0.0' }, () => {
    n++
  })
  core.register({ id: 'dup', version: '2.0.0' }, () => {
    n++
  })
  assert.equal(n, 1)
  assert.equal(core.plugins.get('dup').version, '1.0.0')
})

test('manifest 校验', () => {
  const core = boot()
  assert.throws(() => core.register({}, () => {}), /manifest\.id 必填/)
  assert.throws(() => core.register({ id: 'a' }, null), /setup 必须是函数/)
})

test('api.ui.menuCommand 登记油猴菜单，无 GM 时静默跳过', () => {
  const menus = []
  globalThis.GM_registerMenuCommand = (title, fn) => {
    const id = menus.length + 1
    menus.push({ id, title, fn })
    return id
  }
  globalThis.GM_unregisterMenuCommand = (id) => {
    const i = menus.findIndex((m) => m.id === id)
    if (i >= 0) menus.splice(i, 1)
  }
  try {
    const core = boot()
    let off
    core.register({ id: 'mc', version: '1.0.0', permissions: ['ui'] }, (api) => {
      off = api.ui.menuCommand('测试菜单', () => {})
    })
    assert.equal(menus.length, 1)
    assert.equal(menus[0].title, '测试菜单')
    off()
    assert.equal(menus.length, 0)

    delete globalThis.GM_registerMenuCommand
    delete globalThis.GM_unregisterMenuCommand
    const silent = core.ui.menuCommand('不应出现', () => {})
    assert.equal(typeof silent, 'function')
    silent()
  } finally {
    delete globalThis.GM_registerMenuCommand
    delete globalThis.GM_unregisterMenuCommand
  }
})

test('检查更新：打开面板不联网；氧未装显示未安装', () => {
  const core = boot()
  let n = 0
  core.net.json = async () => {
    n++
    return { version: '9.9.9', url: 'https://example.invalid' }
  }
  core.ui.openPanel('__core_updates')
  const view = document.querySelector('.lsb-view')
  assert.match(view.textContent, /对照 Greasy Fork/)
  assert.match(view.textContent, /安装仍由油猴接管；两个都要装，先氢后氧/)
  const h = view.querySelector('[data-script="hydrogen"]')
  const o = view.querySelector('[data-script="oxygen"]')
  assert.ok(h)
  assert.ok(o)
  assert.match(h.textContent, new RegExp(VERSION.replace(/\./g, '\\.')))
  assert.match(o.textContent, /未安装/)
  const inst = o.querySelector('[data-install]')
  assert.ok(inst)
  assert.equal(inst.getAttribute('href'), 'https://greasyfork.org/zh-CN/scripts/592915-linux-sb-%E6%B0%A7-beta')
  assert.equal(inst.getAttribute('target'), '_blank')
  assert.equal(n, 0)
})

function bumpPatch(v) {
  const m = String(v).match(/^(\d+)\.(\d+)\.(\d+)/)
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`
}

test('检查更新：有 suite 时两条 JSON 都带 external；氢落后给出安装链', async () => {
  const core = boot()
  core.register({ id: 'suite', name: '重装套件', version: '1.0.80' }, () => ({}))
  const calls = []
  const storeH = bumpPatch(VERSION)
  core.net.json = async (url, opts) => {
    calls.push({ url, external: opts?.external })
    if (String(url).includes('592914')) return { version: storeH, url: 'https://greasyfork.org/zh-CN/scripts/592914-h' }
    if (String(url).includes('592915')) return { version: '1.0.83', url: 'https://greasyfork.org/zh-CN/scripts/592915-o' }
    throw new Error('unexpected ' + url)
  }
  core.ui.openPanel('__core_updates')
  const view = document.querySelector('.lsb-view')
  await view.querySelector('[data-check]').onclick()
  assert.equal(calls.length, 2)
  assert.ok(calls.every((c) => c.external === true))
  assert.ok(calls.some((c) => c.url.includes('592914.json')))
  assert.ok(calls.some((c) => c.url.includes('592915.json')))
  const h = view.querySelector('[data-script="hydrogen"]')
  assert.match(h.textContent, /有更新/)
  const a = h.querySelector('[data-install]')
  assert.equal(a.getAttribute('href'), 'https://greasyfork.org/zh-CN/scripts/592914-h')
  const o = view.querySelector('[data-script="oxygen"]')
  assert.match(o.textContent, /有更新/)
})

test('检查更新：无 suite 不请求氧 JSON', async () => {
  const core = boot()
  const urls = []
  core.net.json = async (url) => {
    urls.push(url)
    return { version: VERSION, url: 'https://greasyfork.org/zh-CN/scripts/592914' }
  }
  core.ui.openPanel('__core_updates')
  await document.querySelector('[data-check]').onclick()
  assert.equal(urls.length, 1)
  assert.match(String(urls[0]), /592914\.json/)
  assert.doesNotMatch(urls.join(' '), /592915/)
})

test('检查更新：氢失败氧成功只脏氢这一行', async () => {
  const core = boot()
  core.register({ id: 'suite', name: '重装套件', version: '1.0.83' }, () => ({}))
  core.net.json = async (url) => {
    if (String(url).includes('592914')) throw new Error('HTTP 500')
    return { version: '1.0.83', url: 'https://greasyfork.org/zh-CN/scripts/592915' }
  }
  core.ui.openPanel('__core_updates')
  const view = document.querySelector('.lsb-view')
  await view.querySelector('[data-check]').onclick()
  assert.match(view.querySelector('[data-script="hydrogen"]').textContent, /查询失败/)
  assert.match(view.querySelector('[data-script="hydrogen"]').textContent, /无法读取 Greasy Fork/)
  assert.match(view.querySelector('[data-script="oxygen"]').textContent, /已是最新/)
})

test('检查更新：connect 拒绝 vs 通用 GM 失败用不同行说明', async () => {
  const core = boot()
  // GM 包装文案总含 @connect/跨域，但只有「域名未放行」「跨域请求被拒绝」才是真 connect
  const genericGm =
    'GM 请求失败: https://greasyfork.org/x（网络失败或被油猴拦截。氢需 @connect 该域名，请确认已更新氢脚本并允许跨域）'
  const connectDenied = 'status 0，多半是域名未放行'

  core.net.json = async () => {
    throw new Error(genericGm)
  }
  core.ui.openPanel('__core_updates')
  const view = document.querySelector('.lsb-view')
  await view.querySelector('[data-check]').onclick()
  const hGeneric = view.querySelector('[data-script="hydrogen"]').textContent
  assert.match(hGeneric, /无法读取 Greasy Fork/)
  assert.doesNotMatch(hGeneric, /氢需要允许 greasyfork\.org 跨域/)

  core.net.json = async () => {
    throw new Error(connectDenied)
  }
  await view.querySelector('[data-check]').onclick()
  const hConnect = view.querySelector('[data-script="hydrogen"]').textContent
  assert.match(hConnect, /氢需要允许 greasyfork\.org 跨域/)
  assert.doesNotMatch(hConnect, /无法读取 Greasy Fork/)
})

test('检查更新：连点不重复请求', async () => {
  const core = boot()
  let n = 0
  let release
  const gate = new Promise((r) => {
    release = r
  })
  core.net.json = async () => {
    n++
    await gate
    return { version: VERSION, url: 'https://greasyfork.org/zh-CN/scripts/592914' }
  }
  core.ui.openPanel('__core_updates')
  const btn = document.querySelector('[data-check]')
  btn.click()
  btn.click()
  assert.equal(n, 1)
  release()
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
})

test('检查更新：LTS 频道只一行且对照 593319', async () => {
  window.__LSB_CHANNEL__ = 'lts'
  window.__LSB_LTS_VERSION__ = '1.0.100'
  const core = boot()
  const calls = []
  core.net.json = async (url, opts) => {
    calls.push({ url, external: opts?.external })
    return { version: '1.0.100', url: 'https://greasyfork.org/zh-CN/scripts/593319-linux-sb-lts' }
  }
  assert.match(core.ui._launcher.title, /LTS/)
  core.ui.openPanel()
  assert.match(document.querySelector('.lsb-panel-head').textContent, /LINUX\.SB · LTS/)
  assert.match(document.querySelector('.lsb-ver').textContent, /1\.0\.100/)
  core.ui.openPanel('__core_updates')
  const view = document.querySelector('.lsb-view')
  assert.ok(view.querySelector('[data-script="lts"]'))
  assert.equal(view.querySelector('[data-script="hydrogen"]'), null)
  assert.equal(view.querySelector('[data-script="oxygen"]'), null)
  assert.doesNotMatch(view.textContent, /两个都要装/)
  assert.doesNotMatch(view.textContent, /LTS 商店页公布后即可对照/)
  await view.querySelector('[data-check]').onclick()
  assert.equal(calls.length, 1)
  assert.match(String(calls[0].url), /593319\.json/)
  assert.equal(calls[0].external, true)
  assert.match(view.querySelector('[data-script="lts"]').textContent, /已是最新/)
})

test('检查更新：LTS connect 拒绝不得写氢', async () => {
  window.__LSB_CHANNEL__ = 'lts'
  window.__LSB_LTS_VERSION__ = '1.0.100'
  const core = boot()
  core.net.json = async () => {
    throw new Error('status 0，多半是域名未放行')
  }
  core.ui.openPanel('__core_updates')
  const view = document.querySelector('.lsb-view')
  await view.querySelector('[data-check]').onclick()
  const text = view.querySelector('[data-script="lts"]').textContent
  assert.match(text, /查询失败/)
  assert.match(text, /LTS 需要允许 greasyfork\.org 跨域/)
  assert.doesNotMatch(text, /氢需要允许/)
})

test('M14 基座通过 api.ai.evidence 暴露纯函数且不改变输入', () => {
  const core = boot()
  let api
  core.register({ id: 'evidence-api-probe', version: '1.0.0' }, (value) => { api = value })
  assert.equal(typeof api.ai.evidence.buildEvidenceSnapshot, 'function')
  assert.equal(typeof api.ai.evidence.diffEvidenceSnapshots, 'function')
  assert.equal(typeof api.ai.evidence.mergeCitationReview, 'function')
  const posts = [{ topicId: 1, postId: 2, floor: 1, page: 1, content: '正文' }]
  const before = JSON.stringify(posts)
  api.ai.evidence.buildEvidenceSnapshot(posts, { kind: 'topic', routeType: 'topic', topicId: 1 })
  assert.equal(JSON.stringify(posts), before)
})

test('M16 基座通过 api.ai.diagnostics 暴露只读纯函数', () => {
  const core = boot()
  let api
  core.register({ id: 'diagnostics-api-probe', version: '1.0.0' }, (value) => { api = value })
  assert.equal(Object.isFrozen(api.ai.diagnostics), true)
  assert.equal(typeof api.ai.diagnostics.normalizeEndpoint, 'function')
  assert.equal(typeof api.ai.diagnostics.classifyProbeResponse, 'function')
  assert.equal(typeof api.ai.diagnostics.redactDiagnostic, 'function')
  const normalized = api.ai.diagnostics.normalizeEndpoint({
    apiUrl: 'https://api.example.test/v1/chat/completions?key=secret',
    model: 'test-model',
  })
  assert.equal(normalized.protocol, 'openai')
  assert.doesNotMatch(normalized.key, /secret/)
})
