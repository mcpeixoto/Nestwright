let show = true
const listeners = new Set<() => void>()

export function showWishPins(): boolean {
  return show
}

export function setShowWishPins(value: boolean): void {
  if (show === value) return
  show = value
  for (const listener of listeners) listener()
}

export function subscribeWishPins(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
