/** Path of the open .nest file. Kept out of the project so it never lands in the save. */
let filePath: string | null = null

export function currentFilePath(): string | null {
  return filePath
}

export function setFilePath(next: string | null): void {
  filePath = next && next.length > 0 ? next : null
}
