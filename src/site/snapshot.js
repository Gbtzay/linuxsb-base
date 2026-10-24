import { num, text, idFrom } from '../util.js'
import { parseList, parseTopic, parseUser } from './parsers.js'
import { readCsrf, readCurrentUser, readForums } from './chrome.js'
import { detectPage } from './chrome.js'

export function snapshot(doc = document, loc = location, prev = null) {
  const page = detectPage(loc)
  const same =
    prev?.page?.type === page.type && (prev.page.id ?? null) === (page.id ?? null)
  const snap = {
    page,
    csrf: readCsrf(doc),
    me: readCurrentUser(doc),
    forums: same && prev.forums ? prev.forums : readForums(doc),
    version: doc.querySelector('link[href*="index.css?v="]')?.getAttribute('href')?.match(/v=v?([\d.]+)/)?.[1] || null,
  }
  if (page.type === 'topic') snap.topic = same && prev.topic ? prev.topic : parseTopic(doc)
  if (page.type === 'user') snap.user = same && prev.user ? prev.user : parseUser(doc)
  if (
    page.type === 'home' ||
    page.type === 'forum' ||
    page.type === 'featured' ||
    page.type === 'hot_discussions' ||
    page.type === 'footprint'
  ) {
    snap.list = same && prev.list ? prev.list : parseList(doc)
  }
  return snap
}
