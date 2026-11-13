export {}

declare global {
  interface Window {
    nestwright?: {
      openFile(accept: string): Promise<{ name: string; data: string } | null>
      saveFile(name: string, data: string): Promise<boolean>
      username?: () => Promise<string>
      hostSession?: () => Promise<{ addresses: string[]; port: number; code: string }>
      leaveSession?: () => Promise<void>
      coopSend?: (peerId: string | null, raw: string) => void
      onCoopMessage?: (cb: (msg: { peerId: string; raw: string }) => void) => () => void
      onCoopClose?: (cb: (msg: { peerId: string }) => void) => () => void
    }
    __nestwright?: {
      useStore: typeof import('../store').useStore
      useSettings: typeof import('../settings').useSettings
    }
  }
}
