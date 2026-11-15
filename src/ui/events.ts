export interface CelebrateEvent {
  kind: 'unlock'
}

type CelebrateListener = (event: CelebrateEvent) => void

const listeners = new Set<CelebrateListener>()

export function emitCelebrate(event: CelebrateEvent): void {
  for (const listener of [...listeners]) listener(event)
}

export function onCelebrate(listener: CelebrateListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
