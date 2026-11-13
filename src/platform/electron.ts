import type { Platform } from './types'

export function electronPlatform(): Platform {
  const bridge = window.nestwright
  if (!bridge?.openFile || !bridge.saveFile) {
    return { isElectron: false, openFile: async () => null, saveFile: async () => false }
  }
  return {
    isElectron: true,
    openFile: (accept) => bridge.openFile(accept),
    saveFile: (name, data) => bridge.saveFile(name, data),
    username: () => bridge.username?.() ?? Promise.resolve(''),
    hostSession: () => bridge.hostSession?.() ?? Promise.reject(new Error('Hosting is unavailable')),
    leaveSession: () => bridge.leaveSession?.() ?? Promise.resolve(),
    coopSend: (peerId, raw) => bridge.coopSend?.(peerId, raw),
    onCoopMessage: (cb) => bridge.onCoopMessage?.(cb) ?? (() => {}),
    onCoopClose: (cb) => bridge.onCoopClose?.(cb) ?? (() => {}),
    quit: () => bridge.quit?.() ?? Promise.resolve(),
  }
}
