import { subscribeLocalApplies } from '../store'

let dirty = false
let savedAt: number | null = null
let snapshot: { dirty: boolean; savedAt: number | null } = { dirty, savedAt }
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

function remember(): void {
  snapshot = { dirty, savedAt }
}

function setDirty(next: boolean): void {
  if (dirty === next) return
  dirty = next
  remember()
  emit()
}

export function isDirty(): boolean {
  return dirty
}

export function getSaveState(): { dirty: boolean; savedAt: number | null } {
  return snapshot
}

/** Successful save, open, or new project. Undo does not call this. */
export function markSaved(): void {
  savedAt = Date.now()
  dirty = false
  remember()
  emit()
}

export function subscribeDirty(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

subscribeLocalApplies(() => {
  setDirty(true)
})
