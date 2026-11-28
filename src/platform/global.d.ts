export {}

declare global {
  interface Window {
    nestwright?: {
      /** Read once in the preload with sendSync, before the store boots. */
      boot?: {
        autosave: string | null
        hasAutosaveFile: boolean
        recent: { id: string; name: string; updatedAt: number; path?: string }[]
        hasRecentFile: boolean
        recentCorrupt?: boolean
      }
      openFile(accept: string): Promise<{ name: string; data: string; path?: string } | null>
      saveFile(name: string, data: string): Promise<{ path: string } | boolean | null>
      saveToPath?(filePath: string, data: string): Promise<boolean>
      writeAutosave?(data: string): Promise<boolean>
      writeRecent?(payload: {
        id: string
        name: string
        updatedAt: number
        path?: string
        project: string
        thumb?: string
      }): Promise<boolean>
      readRecentProject?(id: string): Promise<string | null>
      readRecentThumb?(id: string): Promise<string | null>
      setEditorState?(state: {
        dirty: boolean
        prompt: { message: string; save: string; dontSave: string; cancel: string }
        menu: import('../../electron/menuLabels').MenuLabels
        fullscreen: boolean
      }): void
      notifyReady?(): void
      onMenu?(cb: (action: 'new' | 'open' | 'save' | 'save-as') => void): () => void
      onHelp?(cb: (action: import('../../electron/menuLabels').HelpAction) => void): () => void
      onFullscreen?(cb: (on: boolean) => void): () => void
      onRequestSave?(cb: () => Promise<boolean> | boolean): () => void
      onOpenPath?(cb: (file: { name: string; data: string; path: string }) => void): () => void
      username?: () => Promise<string>
      hostSession?: () => Promise<{ addresses: string[]; port: number; code: string }>
      leaveSession?: () => Promise<void>
      coopSend?: (peerId: string | null, raw: string) => void
      onCoopMessage?: (cb: (msg: { peerId: string; raw: string }) => void) => () => void
      onCoopClose?: (cb: (msg: { peerId: string }) => void) => () => void
      quit?: () => Promise<void>
      photo3d?: {
        configured(command: string): Promise<boolean>
        pick(): Promise<{ photos: import('./types').PickedPhoto[]; truncated: boolean } | null>
        run(request: {
          runId: string
          command: string
          images: string[]
          quality: import('./types').Photo3dQuality
        }): Promise<import('./types').Photo3dResult>
        cancel(runId: string): Promise<boolean>
        onProgress(cb: (progress: import('./types').Photo3dProgress) => void): () => void
      }
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
      /** Catalog lookup, so the visual harness can place items (lamps) the way the tool does. */
      getEntry?: typeof import('../catalog/registry').getEntry
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
