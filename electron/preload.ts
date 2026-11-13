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
})
