export interface RecentEntry {
  id: string
  name: string
  updatedAt: number
  thumb: string
  data: string
}

export function pushRecent(list: readonly RecentEntry[], entry: RecentEntry, limit = 8): RecentEntry[] {
  const next = [entry, ...list.filter((item) => item.id !== entry.id && item.id)]
  return next.slice(0, Math.max(1, limit))
}
