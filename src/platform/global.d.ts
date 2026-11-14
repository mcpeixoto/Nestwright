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
      quit?: () => Promise<void>
      steam?: {
        available(): Promise<boolean>
        playerName(): Promise<string>
        unlock(id: string): Promise<boolean>
        overlayUrl(url: string): Promise<void>
        getStat?(name: string): Promise<number | null>
        setStat?(name: string, value: number): Promise<boolean>
        setPresence?(status: string | null): Promise<boolean>
        showKeyboard?(req: {
          mode: 'single' | 'multi' | 'email' | 'numeric'
          x: number
          y: number
          width: number
          height: number
        }): Promise<boolean>
        isSteamDeck?(): Promise<boolean>
      }
      reportCrash?(payload: { kind: 'error' | 'rejection'; message: string; stack?: string }): Promise<void>
      onShowAchievements?(callback: () => void): () => void
    }
    __nestwright?: {
      useStore: typeof import('../store').useStore
      useSettings: typeof import('../settings').useSettings
      /** Live 3D controller, for smoke tests and pixel checks. */
      getController?: typeof import('../view3d/SceneController').getController
      /** Opens a template the same way the gallery card does. */
      loadTemplate?: (id: string) => boolean
      roomCameraPose?: typeof import('../model/roomCamera').roomCameraPose
      perf?: {
        report: (frames?: number) => Promise<import('../view3d/perfMonitor').PerfReport>
      }
    }
  }
}
