export type CelebrateEvent = { kind: 'unlock' } | { kind: 'room-complete'; names: readonly string[] }

type Listener = (event: CelebrateEvent) => void

const listeners = new Set<Listener>()

/** Achievement unlocks and newly closed rooms. Listeners run synchronously. */
export function emitCelebrate(event: CelebrateEvent): void {
  for (const listener of listeners) {
    try {
      listener(event)
    } catch {
      /* a celebration must not break the edit that earned it */
    }
  }
}

export function onCelebrate(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function resetCelebrateForTests(): void {
  listeners.clear()
}
