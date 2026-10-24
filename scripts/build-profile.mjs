export const BUILD_PROFILES = Object.freeze(['release', 'dev'])

export function readBuildProfile(argv = process.argv.slice(2)) {
  const options = argv.filter((arg) => arg.startsWith('--profile='))
  if (options.length > 1) throw new Error('只允许指定一个 --profile')
  const profile = options[0]?.slice('--profile='.length) || 'release'
  if (!BUILD_PROFILES.includes(profile)) {
    throw new Error(`未知构建配置：${profile}（可用：${BUILD_PROFILES.join(', ')}）`)
  }
  return profile
}

export function outputDirectory(profile) {
  return profile === 'dev' ? 'dist-dev' : 'dist'
}

/**
 * Skin contains build-only AI blocks marked with paired line comments. Release
 * artifacts omit their contents; developer artifacts retain the contents while
 * removing the markers so the source remains directly installable in tests.
 */
export function applyPluginBuildProfile(id, source, profile) {
  if (id !== 'skin') return source
  const lines = String(source).replace(/\r\n?/g, '\n').split('\n')
  const output = []
  let inDeveloperAiBlock = false
  for (const line of lines) {
    const marker = line.trim()
    if (marker === '// @LSB_DEV_AI_START') {
      if (inDeveloperAiBlock) throw new Error('skin 构建标记不能嵌套')
      inDeveloperAiBlock = true
      continue
    }
    if (marker === '// @LSB_DEV_AI_END') {
      if (!inDeveloperAiBlock) throw new Error('skin 构建标记缺少 START')
      inDeveloperAiBlock = false
      continue
    }
    if (!inDeveloperAiBlock || profile === 'dev') output.push(line)
  }
  if (inDeveloperAiBlock) throw new Error('skin 构建标记缺少 END')
  return output.join('\n')
}
