import type { Level, Project, Vec2 } from '../model/types'
import type { LevelDisplay } from '../store'
import type { PlanTransform } from '../tools/types'

export interface PlanDrawContext {
  worldToScreen(p: Vec2): { x: number; y: number }
  screenToWorld(x: number, y: number): Vec2
  zoom: number
  /** Zoom established by Fit. Item names appear when zoom exceeds twice this. */
  defaultZoom: number
  width: number
  height: number
  level: Level | null
  project: Project
  selection: readonly string[]
  hover: string | null
  levelDisplay: LevelDisplay
  toolId: string
  pointer: {
    raw: Vec2
    point: Vec2
    screen: { x: number; y: number }
    shift: boolean
    alt: boolean
    meta: boolean
    ctrl: boolean
  }
  transform: PlanTransform
}

export interface PlanLayer {
  id: string
  order: number
  draw(ctx2d: CanvasRenderingContext2D, ctx: PlanDrawContext): void
}

const layers = new Map<string, PlanLayer>()

/** Registering the same id again replaces that layer. Built-ins use the orders in ARCHITECTURE.md. */
export function registerPlanLayer(layer: PlanLayer): void {
  layers.set(layer.id, layer)
}

export function listPlanLayers(): PlanLayer[] {
  return [...layers.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}
