import type { Platform } from './types'

export function webPlatform(): Platform {
  return {
    isElectron: false,
    async openFile(accept) {
      if (typeof document === 'undefined') return null
      return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = accept
        input.onchange = () => {
          const file = input.files?.[0]
          if (!file) {
            resolve(null)
            return
          }
          const reader = new FileReader()
          const binary = /glb|gltf|obj/i.test(accept)
          reader.onload = () => {
            const raw = String(reader.result ?? '')
            if (!binary) {
              resolve({ name: file.name, data: raw })
              return
            }
            const comma = raw.indexOf(',')
            resolve({ name: file.name, data: comma >= 0 ? raw.slice(comma + 1) : raw })
          }
          reader.onerror = () => resolve(null)
          if (binary) reader.readAsDataURL(file)
          else reader.readAsText(file)
        }
        input.click()
      })
    },
    async saveFile(name, data) {
      if (typeof document === 'undefined') return false
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      URL.revokeObjectURL(url)
      return true
    },
  }
}
