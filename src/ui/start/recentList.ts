export interface RecentEntry {
  id: string
  name: string
  updatedAt: number
  thumb: string
  data: string
  /** Absolute path of the .nest file, when this project was saved or opened as one. */
  path?: string
}

export function relativeTime(updatedAt: number, now = Date.now()): { key: string; n?: number } {
  const seconds = Math.max(0, now - updatedAt) / 1000
  if (seconds < 45) return { key: 'Just now' }
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return { key: '{n} min ago', n: minutes }
  const hours = Math.round(minutes / 60)
  if (hours < 24) return { key: '{n} h ago', n: hours }
  const days = Math.round(hours / 24)
  if (days < 14) return { key: '{n} d ago', n: days }
  return { key: 'Earlier' }
}

export function pushRecent(list: readonly RecentEntry[], entry: RecentEntry, limit = 8): RecentEntry[] {
  const next = [entry, ...list.filter((item) => item.id !== entry.id && item.id)]
  return next.slice(0, Math.max(1, limit))
}
