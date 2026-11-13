export interface OpenedFile {
  name: string
  data: string
}

export interface SteamApi {
  available(): Promise<boolean>
  playerName(): Promise<string>
  unlock(id: string): Promise<boolean>
  overlayUrl(url: string): Promise<void>
}

export interface Platform {
  openFile(accept: string): Promise<OpenedFile | null>
  saveFile(name: string, data: string): Promise<boolean>
  isElectron: boolean
  /** Present in Electron. Undefined in the browser. */
  steam?: SteamApi
}
