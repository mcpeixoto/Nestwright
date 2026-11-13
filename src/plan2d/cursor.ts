import type { Vec2 } from '../model/types'

let cursor: Vec2 | null = null
const listeners = new Set<() => void>()

export function setPlanCursor(next: Vec2 | null): void {
  if (cursor && next && cursor.x === next.x && cursor.y === next.y) return
  if (!cursor && !next) return
  cursor = next ? { x: next.x, y: next.y } : null
  for (const listener of listeners) listener()
}

export function getPlanCursor(): Vec2 | null {
  return cursor
}

export function subscribePlanCursor(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
