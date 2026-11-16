import { steamFromBridge } from './steam'
import { PHOTO3D_UNAVAILABLE, type Platform } from './types'

export function electronPlatform(): Platform {
  const bridge = window.nestwright
  if (!bridge?.openFile || !bridge.saveFile) {
    return { isElectron: false, openFile: async () => null, saveFile: async () => false }
  }
  return {
    isElectron: true,
    openFile: (accept) => bridge.openFile(accept),
    saveFile: async (name, data) => {
      const result = await bridge.saveFile(name, data)
      if (typeof result === 'boolean') return result
      return result != null
    },
    chooseSavePath: async (name, data) => {
      const result = await bridge.saveFile(name, data)
      if (!result || typeof result === 'boolean') return null
      return result.path || null
    },
    saveToPath: (filePath, data) => bridge.saveToPath?.(filePath, data) ?? Promise.resolve(false),
    username: () => bridge.username?.() ?? Promise.resolve(''),
    hostSession: () => bridge.hostSession?.() ?? Promise.reject(new Error('Hosting is unavailable')),
    leaveSession: () => bridge.leaveSession?.() ?? Promise.resolve(),
    coopSend: (peerId, raw) => bridge.coopSend?.(peerId, raw),
    onCoopMessage: (cb) => bridge.onCoopMessage?.(cb) ?? (() => {}),
    onCoopClose: (cb) => bridge.onCoopClose?.(cb) ?? (() => {}),
    quit: () => bridge.quit?.() ?? Promise.resolve(),
    steam: steamFromBridge(bridge.steam),
    photo3d: bridge.photo3d ? { available: true, ...bridge.photo3d } : PHOTO3D_UNAVAILABLE,
  }
}
