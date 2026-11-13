export interface OpenedFile {
  name: string
  data: string
}

export interface CoopHostInfo {
  addresses: string[]
  port: number
  code: string
}

export interface Platform {
  openFile(accept: string): Promise<OpenedFile | null>
  saveFile(name: string, data: string): Promise<boolean>
  isElectron: boolean
  steam?: { available: boolean }
  username?: () => Promise<string>
  hostSession?: () => Promise<CoopHostInfo>
  leaveSession?: () => Promise<void>
  coopSend?: (peerId: string | null, raw: string) => void
  onCoopMessage?: (cb: (msg: { peerId: string; raw: string }) => void) => () => void
  onCoopClose?: (cb: (msg: { peerId: string }) => void) => () => void
}
