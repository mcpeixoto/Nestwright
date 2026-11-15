import type * as THREE from 'three'
import type { MaterialRef } from '../model/types'

export interface ParamDef {
  key: string
  label: string
  kind: 'number' | 'boolean' | 'enum'
  min?: number
  max?: number
  step?: number
  options?: string[]
  default: number | string | boolean
}

export interface BuildContext {
  size: { w: number; d: number; h: number }
  materials: Record<string, THREE.MeshStandardMaterial>
  params: Record<string, number | string | boolean>
}

export interface CatalogEntry {
  id: string
  name: string
  category: string
  tags: string[]
  defaultSize: { w: number; d: number; h: number }
  price: number
  materialSlots: Record<string, MaterialRef>
  params?: ParamDef[]
  light?: {
    /** Shade tint before 0.7; lamps now take their colour from `kelvin`. */
    color: string
    /** Pre-0.7 relative intensity; old saves' `params.intensity` is read against it. */
    intensity: number
    /** Default luminous flux. */
    lumens: number
    /** Default colour temperature. */
    kelvin: number
    distance: number
    offsetY: number
    spot?: boolean
    angle?: number
  }
  /** Ceiling-hung, wall-mounted, or sitting on the floor. */
  mount?: 'floor' | 'wall' | 'ceiling'
  /** Preferred base height for wall-mounted items. */
  mountHeight?: number
  /** Place with the back face against the nearest wall. */
  againstWall?: boolean
  /** Origin at the bottom centre. +x width, +z depth, +y up, bounds equal to `size`. */
  build(ctx: BuildContext): THREE.Group
}

export const CATEGORIES = [
  'living',
  'dining',
  'bedroom',
  'kitchen',
  'bathroom',
  'office',
  'outdoor',
  'lighting',
  'decor',
  'plants',
  'structure',
] as const

export type CatalogCategory = (typeof CATEGORIES)[number]
