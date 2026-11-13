import { useSyncExternalStore } from 'react'
import type { GroundLayer } from '../model/types'
import { PLANT_SPECIES, type PlantSpecies } from '../model/terrain'

export type SculptMode = 'raise' | 'lower' | 'flatten' | 'smooth'
export type WaterKind = 'pond' | 'pool' | 'stream'

export interface BrushState {
  sculpt: SculptMode
  radius: number
  strength: number
  layer: GroundLayer
  species: PlantSpecies
  density: number
  waterKind: WaterKind
  fenceStyle: string
  fenceHeight: number
}

const listeners = new Set<() => void>()

let state: BrushState = {
  sculpt: 'raise',
  radius: 3,
  strength: 0.45,
  layer: 'gravel',
  species: 'oak',
  density: 0.035,
  waterKind: 'pond',
  fenceStyle: 'picket',
  fenceHeight: 1.05,
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function getBrush(): BrushState {
  return state
}

export function setBrush(partial: Partial<BrushState>): void {
  const next = { ...state, ...partial }
  next.radius = clamp(next.radius, 1, 20)
  next.strength = clamp(next.strength, 0.05, 1)
  next.density = clamp(next.density, 0.01, 8)
  next.fenceHeight = clamp(next.fenceHeight, 0.3, 3.5)
  if (!PLANT_SPECIES.includes(next.species)) next.species = 'oak'
  state = next
  for (const listener of listeners) listener()
}

export function subscribeBrush(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useBrush(): BrushState {
  return useSyncExternalStore(subscribeBrush, getBrush, getBrush)
}

const BRUSH_TOOLS = new Set(['terrain-sculpt', 'ground-paint', 'plant-brush', 'path', 'ivy'])

export function brushRadiusFor(tool: string): number | null {
  if (!BRUSH_TOOLS.has(tool)) return null
  if (tool === 'ivy') return 0.35
  return getBrush().radius
}

let stamp = 0

/** Shared throttle so a pointer-move storm does not sculpt every event. */
export function allowDab(ms = 36): boolean {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  if (now - stamp < ms) return false
  stamp = now
  return true
}
