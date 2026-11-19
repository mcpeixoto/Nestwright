import { useSyncExternalStore } from 'react'
import { getSaveState, subscribeDirty } from '../io/dirty'

export function formatClock(ms: number): string {
  const date = new Date(ms)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/** i18n key for the top-bar save label. Callers translate it. */
export function saveStateLabel(state: { dirty: boolean; savedAt: number | null }): string {
  if (state.dirty) return 'Unsaved changes'
  if (state.savedAt != null) return 'Saved ✓'
  return ''
}

export function useSaveState(): { dirty: boolean; savedAt: number | null } {
  return useSyncExternalStore(subscribeDirty, getSaveState)
}

let lastAutosaveNote = 0

/** True at most once per minute, so autosave does not spam the toast host. */
export function noteAutosave(): boolean {
  const now = Date.now()
  if (now - lastAutosaveNote < 60_000) return false
  lastAutosaveNote = now
  return true
}
