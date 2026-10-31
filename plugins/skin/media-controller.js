/** Owns one skin instance's media resources; reset is reusable, dispose is final. */
export function createSkinMediaController({ window, document, media, style, getContext, toast }) {
  const root = document.documentElement
  const fontProperty = '--lsb-shell-font-family'
  const revisions = new Map()
  let disposed = false
  let epoch = 0
  let database = null
  let background = null
  let font = null

  function abortError() {
    const error = new Error('media-operation-cancelled')
    error.name = 'AbortError'
    return error
  }

  function assertCurrent(start) {
    if (disposed || start !== epoch) throw abortError()
  }

  function closeDatabase(record) {
    if (!record?.db) return
    try { record.db.close?.() } catch { /* already closed */ }
    record.db = null
  }

  function ensureDatabase() {
    if (!media?.openMediaDb) return Promise.resolve(null)
    if (!database) {
      const record = { db: null, promise: null }
      database = record
      record.promise = Promise.resolve().then(() => media.openMediaDb(window.indexedDB, 'lsb_skin_media')).then((db) => {
        record.db = db
        if (disposed || database !== record) {
          closeDatabase(record)
          throw abortError()
        }
        return db
      }).catch((error) => {
        if (error?.name === 'AbortError') throw error
        if (database === record) database = null
        return null
      })
    }
    return database.promise
  }

  async function loadLocal(kind, key) {
    if (!key || !media?.readMedia) return null
    const start = epoch
    try {
      const db = await ensureDatabase()
      assertCurrent(start)
      if (!db) return null
      const file = await media.readMedia({ db, kind, key })
      assertCurrent(start)
      return file && (!media.validateMediaFile || media.validateMediaFile(file, { kind }).ok) ? file : null
    } catch { return null }
  }

  async function saveFile(kind, file) {
    const start = epoch
    assertCurrent(start)
    const check = media?.validateMediaFile?.(file, { kind })
    if (!check?.ok) throw new Error(check?.reason || 'media-validation-unavailable')
    try {
      const db = await ensureDatabase()
      assertCurrent(start)
      if (!db || !media?.writeMedia) throw new Error('media-store-unavailable')
      const key = `${window.location.origin}:${kind}`
      await media.writeMedia({ db, kind, key, value: file })
      assertCurrent(start)
      const revisionKey = `${kind}:${key}`
      revisions.set(revisionKey, (revisions.get(revisionKey) || 0) + 1)
      return key
    } catch (error) {
      assertCurrent(start)
      throw error
    }
  }

  function releaseBackground(record) {
    if (!record) return
    const node = record.node
    if (node) {
      node.removeEventListener('error', record.onError)
      if (record.mode === 'video') {
        try { node.pause?.() } catch { /* unavailable media element */ }
      }
      node.removeAttribute('src')
      if (record.mode === 'video') {
        try { node.load?.() } catch { /* release the decoder when available */ }
      }
      node.remove()
      record.node = null
    }
    if (record.url) {
      try { window.URL.revokeObjectURL(record.url) } catch { /* ignore */ }
      record.url = ''
    }
  }

  function releaseFont(record) {
    record?.face?.dispose?.()
    if (record) record.face = null
  }

  function applyFont(record) {
    const family = record?.face ? 'LSBShellUserFont' : record?.fallback
    if (family) root.style.setProperty(fontProperty, family)
    else root.style.removeProperty(fontProperty)
  }

  function syncBackground({ config, appearance, workspace, canvasMode }) {
    const requested = String(appearance.background || '').toLowerCase()
    const mode = requested === 'video' || (requested !== 'image' && config.backgroundVideoEnabled === true)
      ? 'video' : requested === 'image' ? 'image' : 'static'
    const enabled = !!config.shell && workspace instanceof window.Element
    const field = mode === 'image' ? 'backgroundImage' : 'backgroundVideo'
    const remote = String(appearance[`${field}Url`] || config[`${field}Url`] || '').trim()
    const localKey = String(appearance[`${field}LocalKey`] || config[`${field}LocalKey`] || '').trim()
    const validRemote = !!media?.isHttpsUrl?.(remote)
    const reduced = appearance.motion === 'reduced' || !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    const key = JSON.stringify([enabled, mode, canvasMode, reduced, validRemote ? remote : '', localKey, revisions.get(`${mode}:${localKey}`) || 0])
    if (background?.key === key && background.workspace === workspace &&
      (background.pending || background.node || !enabled || mode === 'static')) return background.promise
    const previous = background
    const record = { key, workspace, mode, node: null, url: '', onError: null, promise: null, pending: true }
    background = record
    releaseBackground(previous)
    root.classList.remove('lsb-skin-video-on', 'lsb-skin-image-on')
    record.promise = (async () => {
      if (!enabled || mode === 'static') return
      let source = ''
      if (localKey) {
        const file = await loadLocal(mode, localKey)
        if (background !== record) return
        if (file) {
          try { source = record.url = window.URL.createObjectURL(file) } catch { /* use HTTPS fallback */ }
        }
      }
      if (!source && validRemote) source = remote
      if (background !== record || !source) return
      const node = document.createElement(mode === 'image' ? 'img' : 'video')
      record.node = node
      node.setAttribute(`data-lsb-shell-${mode}`, '')
      node.setAttribute(`data-lsb-shell-${mode}-layer`, canvasMode ? 'canvas' : 'windowed')
      node.setAttribute('aria-hidden', 'true')
      const current = () => background === record && record.node === node
      if (mode === 'image') {
        node.alt = ''
        node.decoding = 'async'
        node.loading = 'eager'
        record.onError = () => {
          if (!current() || node.dataset.lsbShellImageState === 'error') return
          root.classList.remove('lsb-skin-image-on')
          node.dataset.lsbShellImageState = 'error'
          toast?.('静态背景加载失败，已使用原始背景', { type: 'error' })
        }
        node.addEventListener('error', record.onError)
        workspace.prepend(node)
        node.src = source
        if (current() && node.dataset.lsbShellImageState !== 'error') {
          root.classList.add('lsb-skin-image-on')
          node.dataset.lsbShellImageState = 'loaded'
        }
        return
      }

      for (const attr of ['muted', 'autoplay', 'loop', 'playsinline']) node.setAttribute(attr, '')
      node.defaultMuted = true
      node.muted = true
      node.loop = true
      node.autoplay = true
      node.playsInline = true
      node.preload = 'auto'
      record.onError = () => {
        if (!current() || node.dataset.lsbShellVideoState === 'error') return
        root.classList.remove('lsb-skin-video-on')
        node.controls = false
        node.style.pointerEvents = 'none'
        node.dataset.lsbShellVideoState = 'error'
        toast?.('视频背景加载失败，已使用静态背景', { type: 'error' })
      }
      node.addEventListener('error', record.onError)
      workspace.prepend(node)
      node.src = source
      try { node.load?.() } catch { /* older media elements may not expose load */ }
      const markPlayback = (state, message) => {
        if (!current() || node.dataset.lsbShellVideoState === 'error' || node.error) return
        root.classList.add('lsb-skin-video-on')
        node.controls = false
        node.style.pointerEvents = 'none'
        node.dataset.lsbShellVideoState = state
        if (message) toast?.(message, { type: 'info' })
      }
      if (reduced) {
        markPlayback('manual', '视频已暂停以减少动态')
        return
      }
      try {
        await node.play()
        markPlayback('playing')
      } catch {
        markPlayback('manual', '浏览器阻止自动播放，视频背景保持静止')
      }
    })().finally(() => { record.pending = false })
    return record.promise
  }

  function syncFont({ config, appearance, workspace }) {
    const enabled = !!config.shell && workspace instanceof window.Element
    const remote = String(appearance.fontUrl || config.fontUrl || '').trim()
    const localKey = String(appearance.fontLocalKey || config.fontLocalKey || '').trim()
    const validRemote = !!media?.isHttpsUrl?.(remote)
    const key = JSON.stringify([enabled, validRemote ? remote : '', localKey, revisions.get(`font:${localKey}`) || 0])
    const fallback = enabled ? style?.sanitizeTokenValue?.('fontFamily', appearance.fontFamily || config.fontFamily) : ''
    if (font?.key === key && (font.pending || font.face || !enabled || !validRemote && !localKey)) {
      font.fallback = fallback
      applyFont(font)
      return font.promise
    }
    const previous = font
    const record = { key, fallback, face: null, promise: null, pending: true }
    font = record
    releaseFont(previous)
    applyFont(record)
    record.promise = (async () => {
      if (!enabled || !media?.loadFontFace || !validRemote && !localKey) return
      const source = validRemote ? `url(${remote})` : await loadLocal('font', localKey)
      if (font !== record || !source) return
      try {
        const face = await media.loadFontFace({ family: 'LSBShellUserFont', source, document, URLCtor: window.URL })
        if (font !== record) {
          face?.dispose?.()
          return
        }
        record.face = face
        applyFont(record)
      } catch {
        if (font !== record) return
        applyFont(record)
        toast?.('字体加载失败，已回退站点字体', { type: 'error' })
      }
    })().finally(() => { record.pending = false })
    return record.promise
  }

  function sync() {
    if (disposed) return Promise.resolve()
    const { config = {}, appearance = {}, workspace, canvasMode = false } = getContext()
    const context = { config, appearance, workspace, canvasMode }
    return Promise.all([syncBackground(context), syncFont(context)])
  }

  function reset() {
    epoch++
    const oldBackground = background, oldFont = font, oldDatabase = database
    background = null
    font = null
    database = null
    releaseBackground(oldBackground)
    releaseFont(oldFont)
    closeDatabase(oldDatabase)
    root.classList.remove('lsb-skin-video-on', 'lsb-skin-image-on')
    root.style.removeProperty(fontProperty)
  }

  function dispose() {
    if (disposed) return
    disposed = true
    reset()
    revisions.clear()
  }

  return { sync, saveFile, reset, dispose }
}
