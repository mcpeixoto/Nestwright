import { detectRooms } from '../model/rooms'
import type { Level } from '../model/types'

export const SFX_NAMES = [
  'place-item',
  'place-wall',
  'snap',
  'delete',
  'undo',
  'redo',
  'door',
  'click',
  'unlock',
  'room-complete',
] as const

export type SfxName = (typeof SFX_NAMES)[number]

const WALL_ADD = new Set(['Draw walls', 'Draw room'])
const ITEM_ADD = new Set(['Place item', 'Paste', 'Duplicate'])

/** History label → effect. Null means the edit stays quiet. */
export function sfxForLabel(label: string): SfxName | null {
  if (WALL_ADD.has(label)) return 'place-wall'
  if (ITEM_ADD.has(label)) return 'place-item'
  if (label === 'Place door') return 'door'
  if (label === 'Delete' || label.startsWith('Delete ') || label.startsWith('Remove ')) return 'delete'
  return null
}

/**
 * Undo and redo reuse the history entry object. A new edit always allocates one,
 * including a coalesced drag that replaces the previous entry in place.
 */
export function historyKind(
  prev: { past: readonly object[]; future: readonly object[] },
  next: { past: readonly object[]; future: readonly object[] },
): 'undo' | 'redo' | 'apply' | null {
  const prevTop = prev.past[prev.past.length - 1]
  const nextTop = next.past[next.past.length - 1]
  if (next.future[0] && next.future[0] === prevTop && next.past.length === prev.past.length - 1) return 'undo'
  if (nextTop && nextTop === prev.future[0] && next.future.length === prev.future.length - 1) return 'redo'
  if (!nextTop) return null
  if (next.past.length === prev.past.length + 1) return 'apply'
  if (next.past.length === prev.past.length && nextTop !== prevTop && next.future.length === 0) return 'apply'
  return null
}

/** A level completed a room when `detectRooms` grew, including a level that was not there before. */
export function gainedRooms(before: readonly Level[], after: readonly Level[]): boolean {
  const previous = new Map<string, number>()
  for (const level of before) previous.set(level.id, detectRooms(level).length)
  for (const level of after) {
    if (detectRooms(level).length > (previous.get(level.id) ?? 0)) return true
  }
  return false
}

export interface SnapCue {
  /** Millimetre key of the point the pointer is on, snapped or not. */
  key: string
  play: boolean
}

function pointKey(point: { x: number; y: number }): string {
  return `${Math.round(point.x * 1000)}:${Math.round(point.y * 1000)}`
}

/**
 * A snap ticks only when the pointer is pulled onto a point and that point is not the one
 * already held. Sitting on the point (or sliding free) keeps the key so the same target
 * does not tick again on the way back.
 */
export function snapCue(
  previous: string | null,
  raw: { x: number; y: number },
  snapped: { x: number; y: number },
): SnapCue {
  const key = pointKey(snapped)
  const dx = raw.x - snapped.x
  const dy = raw.y - snapped.y
  const pulled = dx * dx + dy * dy > 1e-8
  if (!pulled) return { key, play: false }
  return { key, play: key !== previous }
}

/** `unit` is 0…1. The result is a playback rate within ±3%. */
export function pitchScale(unit: number): number {
  const t = Math.min(1, Math.max(0, unit))
  return 0.97 + t * 0.06
}
