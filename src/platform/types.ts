export interface OpenedFile {
  name: string
  data: string
}

export interface Platform {
  openFile(accept: string): Promise<OpenedFile | null>
  saveFile(name: string, data: string): Promise<boolean>
  isElectron: boolean
  steam?: { available: boolean }
}
