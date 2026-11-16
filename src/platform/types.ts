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

export type Photo3dQuality = 'fast' | 'best'

export interface PickedPhoto {
  path: string
  name: string
  /** Small data URL, or '' when the image could not be decoded for a preview. */
  preview: string
}

export type Photo3dResult = { ok: true; data: string } | { ok: false; error: string; cancelled?: boolean }

export interface Photo3dProgress {
  runId: string
  value: number
  stage: string
}

/** The local photo-to-3D converter. Electron only; the browser build reports it unavailable. */
export interface Photo3dApi {
  available: boolean
  /** Whether the command (or the NESTWRIGHT_PHOTO3D fallback when it is empty) can run. */
  configured(command: string): Promise<boolean>
  pick(): Promise<{ photos: PickedPhoto[]; truncated: boolean } | null>
  run(request: { runId: string; command: string; images: string[]; quality: Photo3dQuality }): Promise<Photo3dResult>
  cancel(runId: string): Promise<boolean>
  onProgress(cb: (progress: Photo3dProgress) => void): () => void
}

export const PHOTO3D_UNAVAILABLE: Photo3dApi = {
  available: false,
  configured: async () => false,
  pick: async () => null,
  run: async () => ({ ok: false, error: 'unavailable' }),
  cancel: async () => false,
  onProgress: () => () => {},
}

export interface Platform {
  photo3d?: Photo3dApi
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
