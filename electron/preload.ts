import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

contextBridge.exposeInMainWorld('nestwright', {
  openFile: (accept: string) => ipcRenderer.invoke('nestwright:open-file', accept) as Promise<{ name: string; data: string } | null>,
  saveFile: (name: string, data: string) => ipcRenderer.invoke('nestwright:save-file', name, data) as Promise<boolean>,
  username: () => ipcRenderer.invoke('nestwright:username') as Promise<string>,
  hostSession: () =>
    ipcRenderer.invoke('nestwright:host-session') as Promise<{ addresses: string[]; port: number; code: string }>,
  leaveSession: () => ipcRenderer.invoke('nestwright:leave-session') as Promise<void>,
  coopSend: (peerId: string | null, raw: string) => {
    ipcRenderer.send('nestwright:coop-send', peerId, raw)
  },
  onCoopMessage: (cb: (msg: { peerId: string; raw: string }) => void) => {
    const listener = (_event: IpcRendererEvent, msg: { peerId: string; raw: string }) => cb(msg)
    ipcRenderer.on('nestwright:coop-message', listener)
    return () => ipcRenderer.removeListener('nestwright:coop-message', listener)
  },
  onCoopClose: (cb: (msg: { peerId: string }) => void) => {
    const listener = (_event: IpcRendererEvent, msg: { peerId: string }) => cb(msg)
    ipcRenderer.on('nestwright:coop-closed', listener)
    return () => ipcRenderer.removeListener('nestwright:coop-closed', listener)
  },
  quit: () => ipcRenderer.invoke('nestwright:quit') as Promise<void>,
  steam: {
    available: () => ipcRenderer.invoke('nestwright:steam-available') as Promise<boolean>,
    playerName: () => ipcRenderer.invoke('nestwright:steam-player') as Promise<string>,
    unlock: (id: string) => ipcRenderer.invoke('nestwright:steam-unlock', id) as Promise<boolean>,
    overlayUrl: (url: string) => ipcRenderer.invoke('nestwright:steam-overlay', url) as Promise<void>,
    getStat: (name: string) => ipcRenderer.invoke('nestwright:steam-stat-get', name) as Promise<number | null>,
    setStat: (name: string, value: number) => ipcRenderer.invoke('nestwright:steam-stat-set', name, value) as Promise<boolean>,
    setPresence: (status: string | null) => ipcRenderer.invoke('nestwright:steam-presence', status) as Promise<boolean>,
    showKeyboard: (req: { mode: 'single' | 'multi' | 'email' | 'numeric'; x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke('nestwright:steam-keyboard', req) as Promise<boolean>,
    isSteamDeck: () => ipcRenderer.invoke('nestwright:steam-deck') as Promise<boolean>,
  },
  reportCrash: (payload: { kind: 'error' | 'rejection'; message: string; stack?: string }) =>
    ipcRenderer.invoke('nestwright:crash', payload) as Promise<void>,
  onShowAchievements: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('nestwright:show-achievements', listener)
    return () => ipcRenderer.removeListener('nestwright:show-achievements', listener)
  },
})
