import type { Project } from '../model/types'
import { deserialize, serialize } from './project'

export const AUTOSAVE_KEY = 'nestwright:autosave'

interface BootSnapshot {
  autosave: string | null
  hasAutosaveFile: boolean
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') return null
    return localStorage
  } catch {
    return null
  }
}

function bridge(): Window['nestwright'] | null {
  try {
    return globalThis.window?.nestwright ?? null
  } catch {
    return null
  }
}

/** Preload reads this once with sendSync so boot stays synchronous. */
function bootSnapshot(): BootSnapshot | null {
  const boot = bridge()?.boot
  if (!boot) return null
  return {
    autosave: typeof boot.autosave === 'string' ? boot.autosave : null,
    hasAutosaveFile: boot.hasAutosaveFile === true,
  }
}

function parseProject(raw: string): Project | null {
  try {
    return deserialize(raw)
  } catch {
    return null
  }
}

export function loadAutosave(): Project | null {
  const boot = bootSnapshot()
  if (boot) {
    if (boot.autosave) {
      const project = parseProject(boot.autosave)
      if (project) return project
      if (boot.hasAutosaveFile) return null
    } else if (boot.hasAutosaveFile) {
      return null
    }
  }
  const bin = storage()
  if (!bin) return null
  const raw = bin.getItem(AUTOSAVE_KEY)
  if (!raw) return null
  return parseProject(raw)
}

export function saveAutosave(project: Project): void {
  let data: string
  try {
    data = serialize(project)
  } catch {
    return
  }
  const api = bridge()
  if (api?.writeAutosave) {
    void api.writeAutosave(data)
    return
  }
  const bin = storage()
  if (!bin) return
  try {
    bin.setItem(AUTOSAVE_KEY, data)
  } catch {
    /* a full disk should not take the editor down */
  }
}

function migrateAutosave(): void {
  const boot = bootSnapshot()
  const api = bridge()
  const bin = storage()
  if (!boot || !api?.writeAutosave || !bin) return
  const legacy = bin.getItem(AUTOSAVE_KEY)
  if (!legacy) return
  if (boot.hasAutosaveFile) {
    if (boot.autosave && parseProject(boot.autosave)) bin.removeItem(AUTOSAVE_KEY)
    return
  }
  void api.writeAutosave(legacy).then((ok) => {
    if (ok) bin.removeItem(AUTOSAVE_KEY)
  })
}

migrateAutosave()
