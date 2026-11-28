/** Which inspector cards the player collapsed; persisted across reloads. */
const KEY = 'nestwright:inspector-collapsed'
const listeners = new Set<() => void>()
let cache: Set<string> | null = null

function load(): Set<string> {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    cache = new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    cache = new Set()
  }
  return cache
}

export function isCollapsed(id: string): boolean {
  return load().has(id)
}

export function toggleCollapsed(id: string): void {
  const next = new Set(load())
  if (next.has(id)) next.delete(id)
  else next.add(id)
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify([...next]))
  } catch {
    // Storage unavailable: the choice lasts for this session only.
  }
  for (const listener of listeners) listener()
}

export function subscribeCollapsed(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Tests: forget the in-memory copy so the next read goes back to storage. */
export function resetCollapsedCache(): void {
  cache = null
}
