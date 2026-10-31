// Owns the skin settings renderer and the current userscript menu registration.
export function createSkinSettingsController({ document, ui, getConfig, saveConfig, configController, mediaController, applyAll }) {
  function renderSkinSettings(host) {
    const section = document.createElement('section')
    section.className = 'lsb-skin-media-settings'
    const heading = document.createElement('h3')
    heading.textContent = '本地资源与窗口布局'
    section.append(heading)
    const hint = document.createElement('p')
    hint.className = 'lsb-row-desc'
    hint.textContent = '视频单文件不超过 50MB，字体单文件不超过 10MB；二进制只保存在本机 IndexedDB。'
    section.append(hint)

    const appendFile = (kind, labelText, accept) => {
      const label = document.createElement('label')
      label.className = 'lsb-field'
      const title = document.createElement('span')
      title.textContent = labelText
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = accept
      input.addEventListener('change', async () => {
        const file = input.files?.[0]
        if (!file || !ui.shellMedia) return
        const check = ui.shellMedia.validateMediaFile(file, { kind })
        if (!check.ok) {
          ui.toast?.(kind === 'video' ? '视频文件超过 50MB 或类型不受支持' : kind === 'image' ? '图片文件超过 20MB 或类型不受支持' : '字体文件超过 10MB 或类型不受支持', { type: 'error' })
          input.value = ''
          return
        }
        try {
          const key = await mediaController.saveFile(kind, file)
          configController.saveLegacyMedia(kind, key)
          applyAll()
          ui.toast?.('本地资源已保存', { type: 'success' })
        } catch (error) {
          if (error?.name === 'AbortError') return
          ui.toast?.('本地资源保存失败', { type: 'error' })
        } finally {
          input.value = ''
        }
      })
      label.append(title, input)
      section.append(label)
    }

    appendFile('video', '选择本地视频', 'video/*')
    appendFile('image', '选择静态图片', 'image/*')
    appendFile('font', '选择本地字体', '.woff2,.woff,.ttf,.otf,font/*')

    const actions = document.createElement('div')
    actions.className = 'lsb-actions'
    const arrange = document.createElement('button')
    arrange.type = 'button'
    arrange.className = 'lsb-btn'
    arrange.textContent = '一键整理窗口'
    arrange.addEventListener('click', () => ui.shellWindowArrange?.())
    const reset = document.createElement('button')
    reset.type = 'button'
    reset.className = 'lsb-btn'
    reset.textContent = '恢复默认布局'
    reset.addEventListener('click', () => ui.shellWindowReset?.())
    actions.append(arrange, reset)
    section.append(actions)
    host.append(section)
  }

  let unregMenu = () => {}
  function syncGmMenu() {
    unregMenu()
    const on = !!getConfig().shell
    unregMenu = ui.menuCommand(on ? '氢壳：关闭，回到原版界面' : '氢壳：开启', () => {
      saveConfig({ shell: !getConfig().shell })
    })
  }

  return { render: renderSkinSettings, syncMenu: syncGmMenu, clearMenu() { unregMenu() } }
}
