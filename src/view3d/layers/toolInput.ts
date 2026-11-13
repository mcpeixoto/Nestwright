import * as THREE from 'three'
import { selectActiveLevel, useStore } from '../../store'
import { getPlanRenderer } from '../../plan2d/PlanRenderer'
import { snapPlanPoint } from '../../plan2d/snap'
import { getTool } from '../../tools/registry'
import type { PlanTransform, ToolContext } from '../../tools/types'
import type { Vec2 } from '../../model/types'
import { gizmoOwnsPointer } from './gizmo'
import { registerSceneLayer, type SceneLayer, type SceneLayerContext } from '../layers'

const SKIP = new Set([
  'select',
  'pan',
  'paint',
  'terrain-sculpt',
  'ground-paint',
  'water',
  'plant-brush',
  'fence',
  'plot-boundary',
  'path',
  'ivy',
])

const WALL_TOOLS = new Set(['door', 'window'])
const ROOF_TOOLS = new Set(['roof', 'skylight'])

const fallbackTransform: PlanTransform = {
  worldToScreen: () => ({ x: 0, y: 0 }),
  screenToWorld: () => ({ x: 0, y: 0 }),
  zoom: 1,
  panBy() {},
  zoomAt() {},
  fit() {},
}

function kindOf(object: THREE.Object3D): string {
  let current: THREE.Object3D | null = object
  while (current) {
    const kind = current.userData.kind
    if (typeof kind === 'string' && kind.length > 0) return kind
    const name = current.name
    if (name === 'sky' || name === 'stars' || name === 'surround' || name === 'horizon' || name === 'treeline') return name
    current = current.parent
  }
  return ''
}

export function createToolInputLayer(ctx: SceneLayerContext): SceneLayer {
  const canvas = ctx.renderer?.domElement ?? null
  if (!canvas) return { sync() {}, dispose() {} }
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const hitPoint = new THREE.Vector3()
  let dragging = false

  const planPoint = (event: PointerEvent): Vec2 | null => {
    const rect = canvas.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return null
    ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, ctx.camera)
    let hits: THREE.Intersection[]
    try {
      hits = raycaster.intersectObject(ctx.scene, true)
    } catch {
      hits = []
    }
    const tool = useStore.getState().tool
    const order = WALL_TOOLS.has(tool)
      ? ['wall', 'room', 'slab', 'terrain']
      : ROOF_TOOLS.has(tool)
        ? ['roof', 'room', 'slab', 'terrain']
        : ['room', 'slab', 'terrain', 'roof', 'wall']
    const usable = hits.filter((hit) => {
      if (!hit.object.visible) return false
      const kind = kindOf(hit.object)
      return kind === 'wall' || kind === 'room' || kind === 'slab' || kind === 'terrain' || kind === 'roof'
    })
    for (const kind of order) {
      const hit = usable.find((item) => kindOf(item.object) === kind)
      if (hit) return finitePoint(hit.point.x, hit.point.z)
    }
    const level = selectActiveLevel(useStore.getState())
    plane.constant = -(level?.elevation ?? 0)
    if (!raycaster.ray.intersectPlane(plane, hitPoint)) return null
    return finitePoint(hitPoint.x, hitPoint.z)
  }

  const toolContext = (event: PointerEvent, raw: Vec2): ToolContext => {
    const rect = canvas.getBoundingClientRect()
    const state = useStore.getState()
    const level = selectActiveLevel(state)
    const tool = getTool(state.tool)
    const plan = getPlanRenderer()
    const zoom = plan?.zoom ?? 1
    const point = level
      ? snapPlanPoint(raw, level, {
          prev: tool?.snapAnchor?.() ?? null,
          extra: tool?.snapTargets?.() ?? [],
          shift: event.shiftKey,
          zoom,
          settings: { grid: state.snapGrid, ends: state.snapEnds, angles: state.snapAngles },
        })
      : raw
    return {
      point,
      raw,
      screen: { x: event.clientX - rect.left, y: event.clientY - rect.top },
      shift: event.shiftKey,
      alt: event.altKey,
      meta: event.metaKey,
      ctrl: event.ctrlKey,
      button: event.button,
      key: '',
      handled: false,
      transform: plan ?? fallbackTransform,
    }
  }

  const activeTool = () => {
    const state = useStore.getState()
    if (state.view === 'walk' || state.view === '2d') return null
    if (SKIP.has(state.tool) || gizmoOwnsPointer()) return null
    return getTool(state.tool) ?? null
  }

  const onDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    const tool = activeTool()
    if (!tool) return
    const raw = planPoint(event)
    if (!raw) return
    event.preventDefault()
    event.stopPropagation()
    dragging = true
    if (ctx.controller.controls) ctx.controller.controls.enabled = false
    try {
      canvas.setPointerCapture(event.pointerId)
    } catch {
      /* the canvas may already have been released */
    }
    const context = toolContext(event, raw)
    tool.onPointerMove?.(context)
    tool.onPointerDown?.(context)
    getPlanRenderer()?.requestDraw()
  }

  const onMove = (event: PointerEvent) => {
    const tool = activeTool()
    if (!tool) return
    const raw = planPoint(event)
    if (!raw) return
    if (dragging) {
      event.preventDefault()
      event.stopPropagation()
    }
    tool.onPointerMove?.(toolContext(event, raw))
    getPlanRenderer()?.requestDraw()
  }

  const onUp = (event: PointerEvent) => {
    if (!dragging) return
    dragging = false
    const tool = getTool(useStore.getState().tool)
    const raw = planPoint(event) ?? { x: 0, y: 0 }
    tool?.onPointerUp?.(toolContext(event, raw))
    if (ctx.controller.controls && useStore.getState().view !== 'walk') ctx.controller.controls.enabled = true
    getPlanRenderer()?.requestDraw()
  }

  canvas.addEventListener('pointerdown', onDown, true)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)

  return {
    sync() {},
    dispose() {
      canvas.removeEventListener('pointerdown', onDown, true)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
    },
  }
}

function finitePoint(x: number, y: number): Vec2 | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  if (Math.hypot(x, y) > 400) return null
  return { x, y }
}

registerSceneLayer({
  id: 'tool-input',
  create: createToolInputLayer,
})
