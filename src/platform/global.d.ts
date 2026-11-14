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
        /** Waits for 30 quiet frames (no compiles) unless `options.settle` says otherwise. */
        report: (
          frames?: number,
          options?: import('../view3d/perfMonitor').PerfReportOptions,
        ) => Promise<import('../view3d/perfMonitor').PerfReport>
      }
      /**
       * Render the live view and read sRGB bytes (as displayed) at world points [x, y, z] or
       * canvas CSS points {x, y}. Null for a point off screen or before the renderer is up.
       */
      samplePixels?: (
        points: readonly import('../view3d/render/readback').SamplePoint[],
      ) => Promise<(import('../view3d/render/readback').PixelSample | null)[]>
    }
  }
}
