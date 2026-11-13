import { selectActiveLevel, useStore } from '../store'
import { eyedropPlan } from '../tools/paint'
import { getTool } from '../tools/registry'
import type { ToolContext } from '../tools/types'
import { setPlanCursor } from './cursor'
import { entityAt } from './hit'
import type { PlanRenderer } from './PlanRenderer'
import { snapPlanPoint } from './snap'

export class PlanInput {
  private space = false
  private panning = false
  private last = { x: 0, y: 0 }

  constructor(private renderer: PlanRenderer) {
    const canvas = renderer.canvas
    canvas.addEventListener('pointerdown', this.onDown)
    canvas.addEventListener('pointermove', this.onMove)
    canvas.addEventListener('pointerup', this.onUp)
    canvas.addEventListener('pointercancel', this.onUp)
    canvas.addEventListener('pointerleave', this.onLeave)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    canvas.addEventListener('contextmenu', this.onMenu)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  dispose(): void {
    const canvas = this.renderer.canvas
    canvas.removeEventListener('pointerdown', this.onDown)
    canvas.removeEventListener('pointermove', this.onMove)
    canvas.removeEventListener('pointerup', this.onUp)
    canvas.removeEventListener('pointercancel', this.onUp)
    canvas.removeEventListener('pointerleave', this.onLeave)
    canvas.removeEventListener('wheel', this.onWheel)
    canvas.removeEventListener('contextmenu', this.onMenu)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
  }

  private context(e: { clientX: number; clientY: number; shiftKey: boolean; altKey: boolean; metaKey: boolean; ctrlKey: boolean; button?: number }): ToolContext {
    const rect = this.renderer.canvas.getBoundingClientRect()
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    const raw = this.renderer.screenToWorld(screen.x, screen.y)
    const state = useStore.getState()
    const level = selectActiveLevel(state)
    const tool = getTool(state.tool)
    const point = level
      ? snapPlanPoint(raw, level, {
          prev: tool?.snapAnchor?.() ?? null,
          extra: tool?.snapTargets?.() ?? [],
          shift: e.shiftKey,
          zoom: this.renderer.zoom,
          settings: { grid: state.snapGrid, ends: state.snapEnds, angles: state.snapAngles },
        })
      : raw
    this.renderer.pointer = {
      raw,
      point,
      screen,
      shift: e.shiftKey,
      alt: e.altKey,
      meta: e.metaKey,
      ctrl: e.ctrlKey,
    }
    setPlanCursor(point)
    if (level) useStore.getState().setHover(entityAt(level, point, this.renderer.zoom))
    return {
      point,
      raw,
      screen,
      shift: e.shiftKey,
      alt: e.altKey,
      meta: e.metaKey,
      ctrl: e.ctrlKey,
      button: e.button ?? 0,
      key: '',
      handled: false,
      transform: this.renderer,
    }
  }

  private onDown = (e: PointerEvent) => {
    if (e.button === 1 || (e.button === 0 && this.space)) {
      this.panning = true
      this.last = { x: e.clientX, y: e.clientY }
      this.renderer.canvas.setPointerCapture(e.pointerId)
      return
    }
    if (e.button !== 0 && e.button !== 2) return
    if (e.altKey && e.button === 0) {
      const ctx = this.context(e)
      eyedropPlan(ctx.raw, ctx.shift)
      this.renderer.requestDraw()
      return
    }
    const tool = getTool(useStore.getState().tool)
    tool?.onPointerDown?.(this.context(e))
    this.renderer.requestDraw()
  }

  private onMove = (e: PointerEvent) => {
    if (this.panning) {
      this.renderer.panBy(e.clientX - this.last.x, e.clientY - this.last.y)
      this.last = { x: e.clientX, y: e.clientY }
      this.context(e)
      return
    }
    const tool = getTool(useStore.getState().tool)
    tool?.onPointerMove?.(this.context(e))
    this.renderer.requestDraw()
  }

  private onUp = (e: PointerEvent) => {
    if (this.panning && (e.button === 1 || e.button === 0)) {
      this.panning = false
      return
    }
    const tool = getTool(useStore.getState().tool)
    tool?.onPointerUp?.(this.context(e))
    this.renderer.requestDraw()
  }

  private onLeave = () => {
    setPlanCursor(null)
    useStore.getState().setHover(null)
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const rect = this.renderer.canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const mouseWheel = Math.abs(e.deltaX) < 1 && Math.abs(e.deltaY) >= 40
    if (e.ctrlKey || mouseWheel || e.deltaMode !== 0) {
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016))
      this.renderer.zoomAt(x, y, factor)
    } else {
      this.renderer.panBy(-e.deltaX, -e.deltaY)
    }
  }

  private onMenu = (e: Event) => {
    e.preventDefault()
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space' && !isTyping(e.target)) {
      this.space = true
      e.preventDefault()
    }
  }

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') this.space = false
  }
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}
