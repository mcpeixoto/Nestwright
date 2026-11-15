import { currentFilePath } from '../../io/documentPath'
import { deserialize, serialize } from '../../io/project'
import type { Project } from '../../model/types'
import { pushRecent, type RecentEntry } from './recentList'

const KEY = 'nestwright:recent'
const LIMIT = 8

interface BootRecent {
  id: string
  name: string
  updatedAt: number
  path?: string
}

let revision = 0
let snapshot: RecentEntry[] | null = null
const listeners = new Set<() => void>()

function bin(): Storage | null {
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

function publish(next?: RecentEntry[]): void {
  snapshot = next ?? readStored()
  revision += 1
  for (const listener of listeners) listener()
}

export function subscribeRecent(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function recentRevision(): number {
  return revision
}

function readStored(): RecentEntry[] {
  const storage = bin()
  if (!storage) return []
  try {
    const raw = storage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map(readEntry).filter((item): item is RecentEntry => item != null).slice(0, LIMIT)
  } catch {
    return []
  }
}

function readEntry(value: unknown): RecentEntry | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<RecentEntry>
  if (typeof record.id !== 'string' || !record.id) return null
  const filePath = typeof record.path === 'string' && record.path ? record.path : undefined
  return {
    id: record.id,
    name: typeof record.name === 'string' && record.name ? record.name : 'Untitled',
    updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : 0,
    thumb: typeof record.thumb === 'string' ? record.thumb : '',
    data: typeof record.data === 'string' ? record.data : '',
    ...(filePath ? { path: filePath } : {}),
  }
}

function entryFromIndex(record: BootRecent): RecentEntry | null {
  if (!record || typeof record.id !== 'string' || !record.id) return null
  const filePath = typeof record.path === 'string' && record.path ? record.path : undefined
  return {
    id: record.id,
    name: typeof record.name === 'string' && record.name ? record.name : 'Untitled',
    updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : 0,
    thumb: '',
    data: '',
    ...(filePath ? { path: filePath } : {}),
  }
}

function patchEntry(id: string, change: (row: RecentEntry) => RecentEntry): void {
  if (!snapshot) return
  let changed = false
  const next = snapshot.map((row) => {
    if (row.id !== id) return row
    const updated = change(row)
    if (updated !== row) changed = true
    return updated
  })
  if (changed) publish(next)
}

/** Index comes from preload; project JSON and thumbnails follow so the first paint is not blocked. */
function hydrate(entries: RecentEntry[]): void {
  const api = bridge()
  if (!api?.readRecentProject) return
  for (const entry of entries) {
    void api.readRecentProject(entry.id).then((data) => {
      if (typeof data !== 'string' || !data) return
      patchEntry(entry.id, (row) => (row.data ? row : { ...row, data }))
    })
    if (!api.readRecentThumb) continue
    void api.readRecentThumb(entry.id).then((thumb) => {
      if (typeof thumb !== 'string' || !thumb) return
      patchEntry(entry.id, (row) => (row.thumb ? row : { ...row, thumb }))
    })
  }
}

function readInitial(): RecentEntry[] {
  const boot = bridge()?.boot
  if (boot?.hasRecentFile) {
    const records = Array.isArray(boot.recent) ? boot.recent : []
    const entries = records.map(entryFromIndex).filter((item): item is RecentEntry => item != null).slice(0, LIMIT)
    hydrate(entries)
    return entries
  }
  return readStored()
}

export function loadRecent(): RecentEntry[] {
  if (!snapshot) snapshot = readInitial()
  return snapshot
}

export function rememberProject(project: Project, thumb: string): void {
  if (!project?.id) return
  const storage = bin()
  const previous = loadRecent()
  const prior = previous.find((item) => item.id === project.id)
  let data = prior?.data ?? ''
  try {
    data = serialize(project)
  } catch {
    /* keep the previous snapshot if this one cannot be serialised */
  }
  const filePath = currentFilePath()
  const entry: RecentEntry = {
    id: project.id,
    name: project.name || 'Untitled',
    updatedAt: project.updatedAt || Date.now(),
    thumb: thumb || prior?.thumb || '',
    data,
    ...(filePath ? { path: filePath } : {}),
  }
  const next = pushRecent(previous, entry, LIMIT)
  const api = bridge()
  if (api?.writeRecent) {
    publish(next)
    void api.writeRecent({
      id: entry.id,
      name: entry.name,
      updatedAt: entry.updatedAt,
      path: entry.path,
      project: entry.data,
      thumb: entry.thumb,
    })
    return
  }
  if (!storage) return
  try {
    storage.setItem(KEY, JSON.stringify(next))
    publish(next)
  } catch {
    try {
      const stripped = next.map((item) => ({ ...item, data: item.id === entry.id ? item.data : '' }))
      storage.setItem(KEY, JSON.stringify(stripped))
      publish(stripped)
    } catch {
      /* a full disk should not take the editor down */
    }
  }
}

export function projectFromRecent(entry: RecentEntry): Project | null {
  if (!entry.data) return null
  try {
    return deserialize(entry.data)
  } catch {
    return null
  }
}

function migrateRecent(): void {
  const api = bridge()
  const boot = api?.boot
  const storage = bin()
  if (!api?.writeRecent || !boot || !storage) return
  const legacy = storage.getItem(KEY)
  if (!legacy) return
  let entries: RecentEntry[]
  try {
    const parsed = JSON.parse(legacy) as unknown
    if (!Array.isArray(parsed)) {
      storage.removeItem(KEY)
      return
    }
    entries = parsed.map(readEntry).filter((item): item is RecentEntry => item != null).slice(0, LIMIT)
  } catch {
    storage.removeItem(KEY)
    return
  }
  if (boot.recentCorrupt) return
  const indexed = new Set((Array.isArray(boot.recent) ? boot.recent : []).map((item) => item.id))
  const missing = entries.filter((item) => item.data && !indexed.has(item.id))
  if (boot.hasRecentFile && missing.length === 0) {
    storage.removeItem(KEY)
    return
  }
  if (!snapshot) snapshot = entries
  const ordered = [...(boot.hasRecentFile ? missing : entries)].reverse()
  void (async () => {
    for (const item of ordered) {
      if (!item.data) continue
      const ok = await api.writeRecent?.({
        id: item.id,
        name: item.name,
        updatedAt: item.updatedAt,
        path: item.path,
        project: item.data,
        thumb: item.thumb,
      })
      if (!ok) return
    }
    storage.removeItem(KEY)
  })()
}

migrateRecent()
