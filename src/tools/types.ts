import type { Vec2 } from '../model/types'

export interface PlanTransform {
  worldToScreen(p: Vec2): { x: number; y: number }
  screenToWorld(x: number, y: number): Vec2
  readonly zoom: number
  panBy(dxPx: number, dyPx: number): void
  zoomAt(screenX: number, screenY: number, factor: number): void
  fit(): void
}

export interface ToolContext {
  point: Vec2
  raw: Vec2
  screen: { x: number; y: number }
  shift: boolean
  alt: boolean
  meta: boolean
  ctrl: boolean
  button: number
  key: string
  transform: PlanTransform
  handled: boolean
}

export interface Tool {
  id: string
  label: string
  /** Inline SVG markup, stroked with currentColor. */
  icon: string
  shortcut?: string
  group: 'build' | 'openings' | 'interior' | 'outside' | 'measure'
  cursor?: string
  onPointerDown?(ctx: ToolContext): void
  onPointerMove?(ctx: ToolContext): void
  onPointerUp?(ctx: ToolContext): void
  onKeyDown?(ctx: ToolContext): void
  drawOverlay?(ctx2d: CanvasRenderingContext2D, ctx: ToolContext): void
  activate?(): void
  deactivate?(): void
  /** Point the angle snap hinges on, usually the last corner of a chain. */
  snapAnchor?(): Vec2 | null
  snapTargets?(): Vec2[]
}
