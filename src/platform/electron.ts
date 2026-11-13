import { steamFromBridge } from './steam'
import type { Platform } from './types'

export function electronPlatform(): Platform {
  const bridge = window.nestwright
  if (!bridge) return { isElectron: false, openFile: async () => null, saveFile: async () => false }
  return {
    isElectron: true,
    openFile: (accept) => bridge.openFile(accept),
    saveFile: (name, data) => bridge.saveFile(name, data),
    steam: steamFromBridge(bridge.steam),
  }
}
