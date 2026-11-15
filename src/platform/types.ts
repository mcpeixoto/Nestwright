export interface OpenedFile {
  name: string
  data: string
  /** Absolute path in Electron. Absent in the browser. */
  path?: string | null
}

export interface CoopHostInfo {
  addresses: string[]
  port: number
  code: string
}

export interface SteamKeyboardRequest {
  mode: 'single' | 'multi' | 'email' | 'numeric'
  x: number
  y: number
  width: number
  height: number
}

export interface SteamApi {
  available(): Promise<boolean>
  playerName(): Promise<string>
  unlock(id: string): Promise<boolean>
  overlayUrl(url: string): Promise<void>
  getStat?(name: string): Promise<number | null>
  setStat?(name: string, value: number): Promise<boolean>
  setPresence?(status: string | null): Promise<boolean>
  showKeyboard?(req: SteamKeyboardRequest): Promise<boolean>
  isSteamDeck?(): Promise<boolean>
}

export interface Platform {
  openFile(accept: string): Promise<OpenedFile | null>
  saveFile(name: string, data: string): Promise<boolean>
  /** Electron save dialog. Returns the chosen absolute path. */
  chooseSavePath?(name: string, data: string): Promise<string | null>
  /** Electron write to a path the user already picked or opened. */
  saveToPath?(filePath: string, data: string): Promise<boolean>
  isElectron: boolean
  quit?: () => Promise<void>
  username?: () => Promise<string>
  hostSession?: () => Promise<CoopHostInfo>
  leaveSession?: () => Promise<void>
  coopSend?: (peerId: string | null, raw: string) => void
  onCoopMessage?: (cb: (msg: { peerId: string; raw: string }) => void) => () => void
  onCoopClose?: (cb: (msg: { peerId: string }) => void) => () => void
  /** Present in Electron. Undefined in the browser. */
  steam?: SteamApi
}
