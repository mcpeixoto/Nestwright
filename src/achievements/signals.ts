type Listener = () => void

const photo = new Set<Listener>()
const cat = new Set<Listener>()
const coop = new Set<Listener>()

function subscribe(set: Set<Listener>, listener: Listener): () => void {
  set.add(listener)
  return () => set.delete(listener)
}

function emit(set: Set<Listener>): void {
  for (const listener of set) {
    try {
      listener()
    } catch {
      /* one listener must not block the others */
    }
  }
}

export function onPhotoExported(listener: Listener): () => void {
  return subscribe(photo, listener)
}

export function notePhotoExported(): void {
  emit(photo)
}

export function onCatMode(listener: Listener): () => void {
  return subscribe(cat, listener)
}

export function noteCatMode(): void {
  emit(cat)
}

/** Co-op code calls this, or dispatches `nestwright:coop-session` on window, when a session starts. */
export function onCoopSession(listener: Listener): () => void {
  return subscribe(coop, listener)
}

export function noteCoopSession(): void {
  emit(coop)
}
