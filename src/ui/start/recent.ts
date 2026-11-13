import { deserialize, serialize } from '../../io/project'
import type { Project } from '../../model/types'
import { pushRecent, type RecentEntry } from './recentList'

const KEY = 'nestwright:recent'
const LIMIT = 8

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

function publish(): void {
  snapshot = readStored()
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
  return {
    id: record.id,
    name: typeof record.name === 'string' && record.name ? record.name : 'Untitled',
    updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : 0,
    thumb: typeof record.thumb === 'string' ? record.thumb : '',
    data: typeof record.data === 'string' ? record.data : '',
  }
}

export function loadRecent(): RecentEntry[] {
  if (!snapshot) snapshot = readStored()
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
  const entry: RecentEntry = {
    id: project.id,
    name: project.name || 'Untitled',
    updatedAt: project.updatedAt || Date.now(),
    thumb: thumb || prior?.thumb || '',
    data,
  }
  const next = pushRecent(previous, entry, LIMIT)
  if (!storage) return
  try {
    storage.setItem(KEY, JSON.stringify(next))
  } catch {
    try {
      storage.setItem(KEY, JSON.stringify(next.map((item) => ({ ...item, data: item.id === entry.id ? item.data : '' }))))
    } catch {
      /* a full disk should not take the editor down */
    }
  }
  publish()
}

export function projectFromRecent(entry: RecentEntry): Project | null {
  if (!entry.data) return null
  try {
    return deserialize(entry.data)
  } catch {
    return null
  }
}
