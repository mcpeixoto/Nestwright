export {}

declare global {
  interface Window {
    nestwright?: {
      openFile(accept: string): Promise<{ name: string; data: string } | null>
      saveFile(name: string, data: string): Promise<boolean>
      steam?: {
        available(): Promise<boolean>
        playerName(): Promise<string>
        unlock(id: string): Promise<boolean>
        overlayUrl(url: string): Promise<void>
      }
      reportCrash?(payload: { kind: 'error' | 'rejection'; message: string; stack?: string }): Promise<void>
      onShowAchievements?(callback: () => void): () => void
    }
    __nestwright?: {
      useStore: typeof import('../store').useStore
      useSettings: typeof import('../settings').useSettings
    }
  }
}
