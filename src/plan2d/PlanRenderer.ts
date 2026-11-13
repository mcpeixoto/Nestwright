import { selectActiveLevel, useStore } from '../store'
import { listPlanLayers, type PlanDrawContext } from './layers'
import './layers/builtin'

const PX = 50

export interface PlanPointer {
  raw: { x: number; y: number }
  point: { x: number; y: number }
  screen: { x: number; y: number }
  shift: boolean
  alt: boolean
  meta: boolean
  ctrl: boolean
}

let activeRenderer: PlanRenderer | null = null

function bindRenderer(renderer: PlanRenderer | null): void {
  activeRenderer = renderer
}

export function getPlanRenderer(): PlanRenderer | null {
  return activeRenderer
}

export class PlanRenderer {
  readonly canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D | null
  private cam = { x: 5, y: 4, zoom: 1 }
  private fittedZoom = 1
  private fittedFor: string | null = null
  private pending = false
  private disposed = false
  pointer: PlanPointer = {
    raw: { x: 0, y: 0 },
    point: { x: 0, y: 0 },
    screen: { x: 0, y: 0 },
    shift: false,
    alt: false,
    meta: false,
    ctrl: false,
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    bindRenderer(this)
  }

  dispose(): void {
    this.disposed = true
    if (activeRenderer === this) bindRenderer(null)
  }

  get zoom(): number {
    return this.cam.zoom
  }

  get defaultZoom(): number {
    return this.fittedZoom
  }

  /** Arrow properties so tools can pass them unbound (`ctx.transform.worldToScreen`). */
  worldToScreen = (p: { x: number; y: number }): { x: number; y: number } => {
    const { width, height } = this.size()
    const s = PX * this.cam.zoom
    return { x: (p.x - this.cam.x) * s + width / 2, y: height / 2 - (p.y - this.cam.y) * s }
  }

  screenToWorld = (x: number, y: number): { x: number; y: number } => {
    const { width, height } = this.size()
    const s = PX * this.cam.zoom
    return { x: this.cam.x + (x - width / 2) / s, y: this.cam.y - (y - height / 2) / s }
  }

  panBy(dxPx: number, dyPx: number): void {
    const s = PX * this.cam.zoom
    this.cam.x -= dxPx / s
    this.cam.y += dyPx / s
    this.requestDraw()
  }

  zoomAt(screenX: number, screenY: number, factor: number): void {
    const before = this.screenToWorld(screenX, screenY)
    this.cam.zoom = Math.min(40, Math.max(0.08, this.cam.zoom * factor))
    const after = this.screenToWorld(screenX, screenY)
    this.cam.x += before.x - after.x
    this.cam.y += before.y - after.y
    this.requestDraw()
  }

  fit(): void {
    const state = useStore.getState()
    const level = selectActiveLevel(state)
    const { width, height } = this.size()
    if (!level || width < 2 || height < 2) return
    const levels = level.walls.length > 0 ? [level] : state.project.levels
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const item of levels) for (const wall of item.walls) {
      minX = Math.min(minX, wall.a.x, wall.b.x)
      minY = Math.min(minY, wall.a.y, wall.b.y)
      maxX = Math.max(maxX, wall.a.x, wall.b.x)
      maxY = Math.max(maxY, wall.a.y, wall.b.y)
    }
    if (!Number.isFinite(minX)) {
      minX = 0
      minY = 0
      maxX = 10
      maxY = 8
    }
    const pad = 1.4
    minX -= pad
    minY -= pad
    maxX += pad
    maxY += pad
    const bw = Math.max(0.5, maxX - minX)
    const bh = Math.max(0.5, maxY - minY)
    this.cam.zoom = Math.min(width / (bw * PX), height / (bh * PX))
    this.fittedZoom = this.cam.zoom
    this.cam.x = (minX + maxX) / 2
    this.cam.y = (minY + maxY) / 2
    this.requestDraw()
  }

  requestDraw(): void {
    if (this.pending || this.disposed) return
    this.pending = true
    const run = () => {
      this.pending = false
      if (!this.disposed) this.draw()
    }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
    else run()
  }

  private size(): { width: number; height: number } {
    return { width: this.canvas.clientWidth, height: this.canvas.clientHeight }
  }

  draw(): void {
    const ctx = this.ctx
    const { width, height } = this.size()
    if (!ctx || width < 1 || height < 1) return
    const state = useStore.getState()
    const level = selectActiveLevel(state)
    if (level && this.fittedFor !== state.project.id && level.walls.length > 0 && width > 2 && height > 2) {
      this.fittedFor = state.project.id
      this.fit()
      return
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const bw = Math.max(1, Math.floor(width * dpr))
    const bh = Math.max(1, Math.floor(height * dpr))
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw
      this.canvas.height = bh
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#f4f0e6'
    ctx.fillRect(0, 0, width, height)

    const render: PlanDrawContext = {
      worldToScreen: (p) => this.worldToScreen(p),
      screenToWorld: (x, y) => this.screenToWorld(x, y),
      zoom: this.cam.zoom,
      defaultZoom: this.fittedZoom,
      width,
      height,
      level: level ?? null,
      project: state.project,
      selection: state.selection,
      hover: state.hover,
      levelDisplay: state.levelDisplay,
      toolId: state.tool,
      pointer: this.pointer,
      transform: this,
    }
    for (const layer of listPlanLayers()) layer.draw(ctx, render)
  }
}
