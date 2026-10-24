export function snapshotValue(source) {
  try { return typeof source === 'function' ? source() : source || {} } catch { return {} }
}

export function routeFingerprint(snapshot) {
  return snapshot?.routeFingerprint ?? snapshot?.route?.fingerprint ?? snapshot?.page?.fingerprint ?? snapshot?.page?.type
}
