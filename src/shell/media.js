export const MEDIA_DB_NAME = 'lsb_skin_media'
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024
export const IMAGE_MAX_BYTES = 20 * 1024 * 1024
export const FONT_MAX_BYTES = 10 * 1024 * 1024

const memory = new Map()

function storeFor(kind) {
  if (kind === 'image' || kind === 'images') return 'images'
  return kind === 'font' || kind === 'fonts' ? 'fonts' : 'videos'
}

function memoryKey(kind, key) {
  return `${storeFor(kind)}:${String(key || '')}`
}

export function isHttpsUrl(value) {
  try {
    return new URL(String(value || ''), 'https://linux.sb/').protocol === 'https:' && /^https:\/\//i.test(String(value || '').trim())
  } catch {
    return false
  }
}

export function validateMediaFile(file, { kind = 'video' } = {}) {
  const store = storeFor(kind)
  const normalized = store === 'fonts' ? 'font' : store === 'images' ? 'image' : 'video'
  const size = Number(file?.size)
  if (!Number.isFinite(size) || size < 0) return { ok: false, reason: 'invalid-size' }
  const limit = normalized === 'font' ? FONT_MAX_BYTES : normalized === 'image' ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES
  if (size > limit) return { ok: false, reason: 'too-large', limit }
  const type = String(file?.type || '').toLowerCase()
  if (normalized === 'video' && type && !type.startsWith('video/')) return { ok: false, reason: 'invalid-type' }
  if (normalized === 'image' && type && !type.startsWith('image/')) return { ok: false, reason: 'invalid-type' }
  if (normalized === 'font' && type && !(/^(?:font|application)\//.test(type) || /(?:woff2?|ttf|otf)/.test(type))) {
    return { ok: false, reason: 'invalid-type' }
  }
  return { ok: true, kind: normalized, limit }
}

/** Validate a persisted media descriptor without touching IndexedDB. */
export function validateMediaDescriptor(kind, descriptor = {}) {
  const store = storeFor(kind)
  const normalized = store === 'fonts' ? 'font' : store === 'images' ? 'image' : 'video'
  const item = descriptor && typeof descriptor === 'object' ? descriptor : {}
  const source = String(item.source || item.url || '').trim()
  if (source) {
    return isHttpsUrl(source)
      ? { ok: true, kind: normalized, source }
      : { ok: false, kind: normalized, reason: 'https-required' }
  }
  const size = Number(item.size)
  const limit = normalized === 'font' ? FONT_MAX_BYTES : normalized === 'image' ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES
  if (!Number.isFinite(size) || size < 0) return { ok: false, kind: normalized, reason: 'invalid-size', limit }
  if (size > limit) return { ok: false, kind: normalized, reason: 'too-large', limit }
  if (item.mime || item.type) {
    const type = String(item.mime || item.type).toLowerCase()
    const valid = normalized === 'video'
      ? type.startsWith('video/')
      : normalized === 'image'
        ? type.startsWith('image/')
        : /^(?:font|application)\//.test(type) || /(?:woff2?|ttf|otf)/.test(type)
    if (!valid) return { ok: false, kind: normalized, reason: 'invalid-type', limit }
  }
  return { ok: true, kind: normalized, size, limit }
}

export function mediaRecordKey(origin, name) {
  return `${String(origin || '')}:${String(name || '')}`
}

export function openMediaDb(indexedDBRef = globalThis.indexedDB, name = MEDIA_DB_NAME) {
  const memoryDb = () => ({ memory: true, name })
  if (!indexedDBRef?.open) return Promise.resolve(memoryDb())
  return new Promise((resolve, reject) => {
    let request
    try { request = indexedDBRef.open(name, 2) } catch { resolve(memoryDb()); return }
    request.onupgradeneeded = () => {
      const db = request.result
      for (const store of ['videos', 'images', 'fonts']) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store)
      }
    }
    request.onsuccess = () => resolve(request.result)
    // Private browsing and hardened contexts can expose indexedDB but reject
    // open(). Keep the current tab usable with the same in-memory adapter used
    // when indexedDB is absent; persistence is restored automatically next load.
    request.onerror = () => resolve(memoryDb())
  })
}

function optionsFrom(first, second) {
  if (first && typeof first === 'object' && ('kind' in first || 'key' in first || 'value' in first)) return first
  return { ...(second || {}), db: first }
}

export async function readMedia(first, second) {
  const { db, kind = 'video', key } = optionsFrom(first, second)
  if (!key) return null
  if (!db || db.memory) return memory.get(memoryKey(kind, key)) ?? null
  return new Promise((resolve, reject) => {
    try {
      const request = db.transaction(storeFor(kind), 'readonly').objectStore(storeFor(kind)).get(String(key))
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => reject(request.error || new Error('media-read-failed'))
    } catch (error) { reject(error) }
  })
}

export async function writeMedia(first, second) {
  const { db, kind = 'video', key, value } = optionsFrom(first, second)
  if (!key) throw new Error('media-key-required')
  if (!db || db.memory) {
    memory.set(memoryKey(kind, key), value)
    return value
  }
  return new Promise((resolve, reject) => {
    try {
      const request = db.transaction(storeFor(kind), 'readwrite').objectStore(storeFor(kind)).put(value, String(key))
      request.onsuccess = () => resolve(value)
      request.onerror = () => reject(request.error || new Error('media-write-failed'))
    } catch (error) { reject(error) }
  })
}

export async function clearMedia(first, second) {
  const { db, kind = 'video', key } = optionsFrom(first, second)
  if (!key) return
  if (!db || db.memory) {
    memory.delete(memoryKey(kind, key))
    return
  }
  return new Promise((resolve, reject) => {
    try {
      const request = db.transaction(storeFor(kind), 'readwrite').objectStore(storeFor(kind)).delete(String(key))
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error || new Error('media-clear-failed'))
    } catch (error) { reject(error) }
  })
}

export async function loadFontFace({ family, source, document: documentRef = globalThis.document, FontFaceCtor = globalThis.FontFace, URLCtor = globalThis.URL } = {}) {
  if (!family || !source || typeof FontFaceCtor !== 'function' || !documentRef?.fonts?.add) {
    throw new Error('font-face-unavailable')
  }
  let objectUrl = ''
  let fontSource = source
  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    if (!URLCtor?.createObjectURL) throw new Error('font-object-url-unavailable')
    objectUrl = URLCtor.createObjectURL(source)
    fontSource = `url(${objectUrl})`
  }
  try {
    const face = new FontFaceCtor(String(family), fontSource)
    await face.load()
    documentRef.fonts.add(face)
    face.dispose = () => {
      try { documentRef.fonts.delete?.(face) } catch { /* ignore */ }
      if (objectUrl) URLCtor.revokeObjectURL?.(objectUrl)
    }
    return face
  } catch (error) {
    if (objectUrl) URLCtor.revokeObjectURL?.(objectUrl)
    throw error
  }
}

