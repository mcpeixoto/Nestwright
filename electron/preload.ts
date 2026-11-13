import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('nestwright', {
  openFile: (accept: string) => ipcRenderer.invoke('nestwright:open-file', accept) as Promise<{ name: string; data: string } | null>,
  saveFile: (name: string, data: string) => ipcRenderer.invoke('nestwright:save-file', name, data) as Promise<boolean>,
  steam: {
    available: () => ipcRenderer.invoke('nestwright:steam-available') as Promise<boolean>,
    playerName: () => ipcRenderer.invoke('nestwright:steam-player') as Promise<string>,
    unlock: (id: string) => ipcRenderer.invoke('nestwright:steam-unlock', id) as Promise<boolean>,
    overlayUrl: (url: string) => ipcRenderer.invoke('nestwright:steam-overlay', url) as Promise<void>,
  },
  reportCrash: (payload: { kind: 'error' | 'rejection'; message: string; stack?: string }) =>
    ipcRenderer.invoke('nestwright:crash', payload) as Promise<void>,
  onShowAchievements: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('nestwright:show-achievements', listener)
    return () => ipcRenderer.removeListener('nestwright:show-achievements', listener)
  },
})
