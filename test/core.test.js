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
})

function boot() {
  const core = new Core()
  core.boot()
  return core
}

test('启动后 snapshot / csrf / 面板就绪', () => {
  const core = boot()
  assert.equal(core.ready, true)
  assert.equal(core.snapshot.page.type, 'topic')
  assert.equal(core.snapshot.me.uid, 5372)
  assert.ok(core.net.csrf())
  // 核心自带三个面板页（日志页排在最后，order=2）
  assert.deepEqual(
    core.ui._tabs.map((t) => t.id),
    ['__core_plugins', '__core_settings', '__core_logs'],
  )
  const launch = document.querySelector('.lsb-launcher')
  assert.ok(launch, '右下角入口已挂载')
  assert.equal(launch.textContent, 'H')
  assert.match(launch.title, /氢/)
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
  assert.throws(() => api.store.set('k', 1), /未声明 'storage' 权限/)
  assert.throws(() => api.ui.toast('x'), /未声明 'ui' 权限/)
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
