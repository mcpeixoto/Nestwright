import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

interface BootPayload {
  autosave: string | null
  hasAutosaveFile: boolean
  recent: { id: string; name: string; updatedAt: number; path?: string }[]
  hasRecentFile: boolean
  recentCorrupt: boolean
}

const EMPTY_BOOT: BootPayload = {
  autosave: null,
  hasAutosaveFile: false,
  recent: [],
  hasRecentFile: false,
  recentCorrupt: false,
}

function readBoot(): BootPayload {
  try {
    const value = ipcRenderer.sendSync('nestwright:boot') as Partial<BootPayload> | null
    if (!value || typeof value !== 'object') return EMPTY_BOOT
    return {
      autosave: typeof value.autosave === 'string' ? value.autosave : null,
      hasAutosaveFile: value.hasAutosaveFile === true,
      recent: Array.isArray(value.recent) ? value.recent : [],
      hasRecentFile: value.hasRecentFile === true,
      recentCorrupt: value.recentCorrupt === true,
    }
  } catch {
    return EMPTY_BOOT
  }
}

const boot = readBoot()

let saveHandler: (() => Promise<boolean>) | null = null
ipcRenderer.on('nestwright:request-save', () => {
  const run = saveHandler ? saveHandler() : Promise.resolve(false)
  void Promise.resolve(run).then(
    (ok) => ipcRenderer.send('nestwright:save-result', ok === true),
    () => ipcRenderer.send('nestwright:save-result', false),
  )
})

contextBridge.exposeInMainWorld('nestwright', {
  boot,
  openFile: (accept: string) =>
    ipcRenderer.invoke('nestwright:open-file', accept) as Promise<{ name: string; data: string; path: string } | null>,
  saveFile: (name: string, data: string) =>
    ipcRenderer.invoke('nestwright:save-file', name, data) as Promise<{ path: string } | null>,
  saveToPath: (filePath: string, data: string) =>
    ipcRenderer.invoke('nestwright:save-to-path', filePath, data) as Promise<boolean>,
  writeAutosave: (data: string) => ipcRenderer.invoke('nestwright:write-autosave', data) as Promise<boolean>,
  writeRecent: (payload: {
    id: string
    name: string
    updatedAt: number
    path?: string
    project: string
    thumb?: string
  }) => ipcRenderer.invoke('nestwright:write-recent', payload) as Promise<boolean>,
  readRecentProject: (id: string) => ipcRenderer.invoke('nestwright:read-recent-project', id) as Promise<string | null>,
  readRecentThumb: (id: string) => ipcRenderer.invoke('nestwright:read-recent-thumb', id) as Promise<string | null>,
  setEditorState: (state: {
    dirty: boolean
    prompt: { message: string; save: string; dontSave: string; cancel: string }
    menu: { file: string; new: string; open: string; save: string; saveAs: string; close: string }
  }) => {
    ipcRenderer.send('nestwright:editor-state', state)
  },
  notifyReady: () => {
    ipcRenderer.send('nestwright:renderer-ready')
  },
  onMenu: (cb: (action: 'new' | 'open' | 'save' | 'save-as') => void) => {
    const listener = (_event: IpcRendererEvent, action: 'new' | 'open' | 'save' | 'save-as') => cb(action)
    ipcRenderer.on('nestwright:menu', listener)
    return () => ipcRenderer.removeListener('nestwright:menu', listener)
  },
  onRequestSave: (cb: () => Promise<boolean> | boolean) => {
    saveHandler = () => Promise.resolve(cb())
    return () => {
      saveHandler = null
    }
  },
  onOpenPath: (cb: (file: { name: string; data: string; path: string }) => void) => {
    const listener = (_event: IpcRendererEvent, file: { name: string; data: string; path: string }) => cb(file)
    ipcRenderer.on('nestwright:open-path', listener)
    return () => ipcRenderer.removeListener('nestwright:open-path', listener)
  },
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
