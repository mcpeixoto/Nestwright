export {}

declare global {
  interface Window {
    nestwright?: {
      openFile(accept: string): Promise<{ name: string; data: string } | null>
      saveFile(name: string, data: string): Promise<boolean>
      quit?: () => Promise<void>
    }
    __nestwright?: {
      useStore: typeof import('../store').useStore
      useSettings: typeof import('../settings').useSettings
    }
  }
}
