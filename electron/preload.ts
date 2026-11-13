import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('nestwright', {
  openFile: (accept: string) => ipcRenderer.invoke('nestwright:open-file', accept) as Promise<{ name: string; data: string } | null>,
  saveFile: (name: string, data: string) => ipcRenderer.invoke('nestwright:save-file', name, data) as Promise<boolean>,
  quit: () => ipcRenderer.invoke('nestwright:quit') as Promise<void>,
})
