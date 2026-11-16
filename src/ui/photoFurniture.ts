/**
 * Pure view-model of the "Furniture from photo" dialog (src/ui/PhotoFurnitureDialog.tsx).
 * No DOM, React or three, so it is unit-tested directly.
 */

import type { Vec2 } from '../model/types'

export const PHOTO_MAX = 3
/** Smallest and largest real size, in metres, a side may have. */
export const SIZE_MIN = 0.05
export const SIZE_MAX = 6

export interface PhotoSize {
  w: number
  d: number
  h: number
}

export const DEFAULT_PHOTO_SIZE: PhotoSize = { w: 0.8, d: 0.6, h: 0.8 }

export type PhotoPhase = 'pick' | 'running' | 'ready' | 'error'

/** "IMG_2041 sofa.HEIC" → "IMG_2041 sofa". */
export function nameFromFile(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? ''
  return base.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 60)
}

export function sizeValid(size: PhotoSize): boolean {
  return [size.w, size.d, size.h].every((value) => Number.isFinite(value) && value >= SIZE_MIN && value <= SIZE_MAX)
}

export type RunBlock = 'web' | 'no-converter' | 'no-photos' | 'too-many' | 'size' | 'busy' | null

/** Why "Make 3D model" cannot run, or null when it can. */
export function runBlock(state: {
  available: boolean
  configured: boolean
  photos: number
  size: PhotoSize
  phase: PhotoPhase
}): RunBlock {
  if (!state.available) return 'web'
  if (!state.configured) return 'no-converter'
  if (state.phase === 'running') return 'busy'
  if (state.photos < 1) return 'no-photos'
  if (state.photos > PHOTO_MAX) return 'too-many'
  if (!sizeValid(state.size)) return 'size'
  return null
}

/** 0..1 → whole percent for the bar, clamped. */
export function progressPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(Math.min(1, Math.max(0, value)) * 100)
}

/** New photo list after a pick: appended, de-duplicated by path, capped at PHOTO_MAX. */
export function mergePhotos<T extends { path: string }>(current: readonly T[], picked: readonly T[]): T[] {
  const out = [...current]
  for (const photo of picked) {
    if (out.some((item) => item.path === photo.path)) continue
    out.push(photo)
  }
  return out.slice(0, PHOTO_MAX)
}

/**
 * Where a new item goes: the centre of the visible plan when there is one, else the centre of
 * the level's walls, else the origin.
 */
export function placementPoint(
  view: { minX: number; minY: number; maxX: number; maxY: number } | null,
  walls: readonly { a: Vec2; b: Vec2 }[],
): Vec2 {
  if (view && [view.minX, view.minY, view.maxX, view.maxY].every(Number.isFinite) && view.maxX > view.minX && view.maxY > view.minY) {
    return { x: (view.minX + view.maxX) / 2, y: (view.minY + view.maxY) / 2 }
  }
  if (walls.length > 0) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const wall of walls) {
      for (const point of [wall.a, wall.b]) {
        minX = Math.min(minX, point.x)
        minY = Math.min(minY, point.y)
        maxX = Math.max(maxX, point.x)
        maxY = Math.max(maxY, point.y)
      }
    }
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
  }
  return { x: 0, y: 0 }
}
