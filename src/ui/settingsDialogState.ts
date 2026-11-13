let open = false
const listeners = new Set<() => void>()

export function isSettingsOpen(): boolean {
  return open
}

export function setSettingsOpen(next: boolean): void {
  if (open === next) return
  open = next
  for (const listener of listeners) listener()
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
