import type { Project } from '../model/types'
import { deserialize, serialize } from './project'

export const AUTOSAVE_KEY = 'nestwright:autosave'

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') return null
    return localStorage
  } catch {
    return null
  }
}

export function loadAutosave(): Project | null {
  const bin = storage()
  if (!bin) return null
  const raw = bin.getItem(AUTOSAVE_KEY)
  if (!raw) return null
  try {
    return deserialize(raw)
  } catch {
    return null
  }
}

export function saveAutosave(project: Project): void {
  const bin = storage()
  if (!bin) return
  try {
    bin.setItem(AUTOSAVE_KEY, serialize(project))
  } catch {
    /* a full disk should not take the editor down */
  }
}
