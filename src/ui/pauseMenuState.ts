let open = false
const listeners = new Set<() => void>()

export function isPauseOpen(): boolean {
  return open
}

export function setPauseOpen(next: boolean): void {
  if (open === next) return
  open = next
  for (const listener of listeners) listener()
}

export function subscribePause(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
