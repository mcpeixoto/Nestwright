import { subscribeLocalApplies } from '../store'

let dirty = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      /* a title listener must not break the edit */
    }
  }
}

function setDirty(next: boolean): void {
  if (dirty === next) return
  dirty = next
  emit()
}

export function isDirty(): boolean {
  return dirty
}

/** Successful save, open, or new project. Undo does not call this. */
export function markSaved(): void {
  setDirty(false)
}

export function subscribeDirty(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

subscribeLocalApplies(() => {
  setDirty(true)
})
