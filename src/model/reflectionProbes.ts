import { pointInPolygon } from './geometry'
import type { Level, Room, Vec2 } from './types'
import type { ProbeBox, Vec3 } from './probeGrid'

/**
 * Layout of the per-room reflection probes: how many cube captures a tier keeps, where a
 * room's capture is taken from and the box its reflections are parallax-corrected against.
 * Pure; the view captures and samples them (src/view3d/lighting/reflectionProbe.ts).
 */

export interface ReflectionTierSettings {
  /** Cube captures kept at once (the camera's room and the ones it came from). */
  slots: number
  /** Face size of the capture cube, pixels. The prefilter works at 256 whatever this is. */
  faceSize: number
  /** Cube faces captured per frame on a rebake (edit, time of day). */
  facesPerFrame: number
  /** The same for a room with no capture yet, whose glossy surfaces wait on it. */
  freshFacesPerFrame: number
}

export const REFLECTION_TIERS: Record<'medium' | 'high' | 'ultra', ReflectionTierSettings> = {
  // A room's first capture sets up a render object per mesh it sees: one face a frame keeps
  // that under a frame's budget (two faces cost ~40 ms on an M-series Mac at High).
  medium: { slots: 1, faceSize: 64, facesPerFrame: 1, freshFacesPerFrame: 1 },
  high: { slots: 2, faceSize: 128, facesPerFrame: 1, freshFacesPerFrame: 1 },
  ultra: { slots: 4, faceSize: 128, facesPerFrame: 1, freshFacesPerFrame: 2 },
}

/** Low keeps the sky reflection everywhere (no captures). */
export function reflectionTier(tier: string): ReflectionTierSettings | null {
  return tier === 'medium' || tier === 'high' || tier === 'ultra' ? REFLECTION_TIERS[tier] : null
}

/** Capture height above the room's floor, metres: about a seated-to-standing eye. */
export const REFLECTION_EYE = 1.4
/** The reflection box sits this far inside the room polygon (walls are drawn on its centre-line). */
export const REFLECTION_INSET = 0.1

function levelHeight(level: Pick<Level, 'height'>): number {
  return level.height > 0 ? level.height : 3
}

function bounds(polygon: readonly Vec2[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of polygon) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  return { minX, maxX, minY, maxY }
}

/** Unique per room and level, stable across edits that keep the room (see Room.key). */
export function reflectionKey(levelId: string, room: Pick<Room, 'key'>): string {
  return `${levelId}|${room.key}`
}

/**
 * The world box (x, y up, z = plan y) a room's reflections are projected onto: its plan
 * bounds pulled in by the half wall, floor to ceiling.
 */
export function roomReflectionBox(room: Pick<Room, 'polygon'>, level: Pick<Level, 'elevation' | 'height'>, inset = REFLECTION_INSET): ProbeBox | null {
  if (room.polygon.length < 3) return null
  const b = bounds(room.polygon)
  if (!Number.isFinite(b.minX) || !Number.isFinite(b.minY)) return null
  const ix = Math.min(inset, (b.maxX - b.minX) / 4)
  const iy = Math.min(inset, (b.maxY - b.minY) / 4)
  return {
    min: { x: b.minX + ix, y: level.elevation, z: b.minY + iy },
    max: { x: b.maxX - ix, y: level.elevation + levelHeight(level), z: b.maxY - iy },
  }
}

/**
 * Where the room's cube is captured: its centroid at REFLECTION_EYE, or for a room whose
 * centroid falls outside it (an L), the inside point nearest the centroid on a coarse grid.
 */
export function reflectionOrigin(room: Pick<Room, 'polygon' | 'centroid'>, level: Pick<Level, 'elevation' | 'height'>): Vec3 {
  const y = level.elevation + Math.min(REFLECTION_EYE, levelHeight(level) - 0.2)
  const c = room.centroid
  if (pointInPolygon(c, room.polygon)) return { x: c.x, y, z: c.y }
  const b = bounds(room.polygon)
  let best: Vec2 | null = null
  let bestGap = Infinity
  const steps = 12
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const p = { x: b.minX + ((b.maxX - b.minX) * i) / steps, y: b.minY + ((b.maxY - b.minY) * j) / steps }
      if (!pointInPolygon(p, room.polygon)) continue
      const gap = Math.hypot(p.x - c.x, p.y - c.y)
      if (gap < bestGap) {
        bestGap = gap
        best = p
      }
    }
  }
  const p = best ?? c
  return { x: p.x, y, z: p.y }
}

export interface ReflectionSlotState {
  key: string | null
  /** When the slot last served the camera (any monotonic clock). */
  used: number
}

/**
 * The slot a room's capture goes in: the one already holding it, else an empty one, else the
 * one used longest ago (never `keep`, the slot on screen while the new one bakes, if there
 * is any other).
 */
export function chooseReflectionSlot(slots: readonly ReflectionSlotState[], key: string, keep = -1): number {
  if (slots.length === 0) return -1
  const held = slots.findIndex((slot) => slot.key === key)
  if (held >= 0) return held
  const empty = slots.findIndex((slot) => slot.key === null)
  if (empty >= 0) return empty
  let best = -1
  for (let i = 0; i < slots.length; i++) {
    if (i === keep && slots.length > 1) continue
    const slot = slots[i]
    const current = best >= 0 ? slots[best] : undefined
    if (slot && (!current || slot.used < current.used)) best = i
  }
  return best
}
