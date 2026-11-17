import * as THREE from 'three'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { resolveItemPose } from '../../model/itemCollision'
import type { Item, Vec2 } from '../../model/types'
import { selectActiveLevel, useStore } from '../../store'
import { registerShortcut } from '../../ui/shortcuts'
import { registerSceneLayer, type SceneLayer, type SceneLayerContext } from '../layers'

export type GizmoMode = 'translate' | 'rotate'

let mode: GizmoMode = 'translate'
let controls: TransformControls | null = null
const listeners = new Set<() => void>()

export function gizmoMode(): GizmoMode {
  return mode
}

export function setGizmoMode(next: GizmoMode): void {
  mode = next
  applyMode()
  for (const listener of listeners) listener()
}

export function subscribeGizmo(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function gizmoOwnsPointer(): boolean {
  if (!controls) return false
  return controls.dragging || controls.axis !== null
}

function applyMode(): void {
  if (!controls) return
  controls.mode = mode
  const move = mode === 'translate'
  controls.showX = move
  controls.showY = true
  controls.showZ = move
  controls.showXZ = move
  controls.showXY = false
  controls.showYZ = false
  controls.showE = !move
  controls.space = 'world'
}

function itemsSelectedIn3D(): boolean {
  const state = useStore.getState()
  if (state.view !== '3d' && state.view !== 'split') return false
  const level = selectActiveLevel(state)
  if (!level) return false
  return level.items.some((item) => state.selection.includes(item.id))
}

/** Drop the gizmo before a rebuild removes the object it is holding. */
export function releaseGizmo(): void {
  controls?.detach()
}

registerShortcut({
  id: 'gizmo-move',
  keys: 'g',
  description: 'Move selected items in 3D',
  when: () => itemsSelectedIn3D(),
  run: () => {
    useStore.getState().setTool('select')
    setGizmoMode('translate')
  },
})

registerShortcut({
  id: 'gizmo-rotate',
  keys: 'e',
  description: 'Rotate selected items in 3D',
  when: () => itemsSelectedIn3D(),
  run: () => {
    useStore.getState().setTool('select')
    setGizmoMode('rotate')
  },
})

interface Origin {
  position: Vec2
  elevation: number
  rotation: number
}

function findRoot(scene: THREE.Scene, id: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null
  scene.traverse((obj) => {
    if (found) return
    if (obj.userData.entityId === id && obj.userData.kind === 'item' && obj.parent?.userData.entityId !== id) found = obj
  })
  return found
}

export function createGizmoLayer(ctx: SceneLayerContext): SceneLayer {
  const canvas = ctx.renderer?.domElement ?? null
  if (!canvas) {
    return { sync() {}, dispose() {} }
  }
  const gizmo = new TransformControls(ctx.camera, canvas)
  controls = gizmo
  gizmo.setTranslationSnap(0.05)
  gizmo.setRotationSnap(Math.PI / 12)
  applyMode()
  const helper = gizmo.getHelper()
  ctx.scene.add(helper)

  let dragIds: string[] = []
  let origins = new Map<string, Origin>()
  const start = new THREE.Vector3()
  let startYaw = 0
  let levelId = ''
  let levelElev = 0

  const orbitEnabled = (on: boolean) => {
    const orbit = ctx.controller.controls
    if (!orbit) return
    orbit.enabled = on && useStore.getState().view !== 'walk'
  }

  let freeMove = false
  const snapForShift = (free: boolean) => {
    freeMove = free
    gizmo.setTranslationSnap(free ? null : 0.05)
    gizmo.setRotationSnap(free ? null : Math.PI / 12)
  }

  const onKey = (event: KeyboardEvent) => snapForShift(event.shiftKey)

  const preview = () => {
    const object = gizmo.object
    if (!object || dragIds.length < 2) return
    const dx = object.position.x - start.x
    const dy = object.position.y - start.y
    const dz = object.position.z - start.z
    const dYaw = object.rotation.y - startYaw
    for (const id of dragIds) {
      if (id === object.userData.entityId) continue
      const root = findRoot(ctx.scene, id)
      const origin = origins.get(id)
      if (!root || !origin) continue
      root.position.set(origin.position.x + dx, levelElev + origin.elevation + dy, origin.position.y + dz)
      root.rotation.y = -origin.rotation + dYaw
    }
  }

  const commit = () => {
    const object = gizmo.object
    if (!object || dragIds.length === 0) return
    const dx = object.position.x - start.x
    const dy = object.position.y - start.y
    const dz = object.position.z - start.z
    const dYaw = object.rotation.y - startYaw
    if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) + Math.abs(dYaw) < 1e-5) return
    const ids = dragIds
    const snapshot = origins
    const activeId = String(object.userData.entityId ?? '')
    const elev = levelElev
    const storedLevel = levelId
    // A snapped single-item move lands clear of walls and furniture; Shift keeps it free.
    const resolve = mode === 'translate' && ids.length === 1 && !freeMove
    useStore.getState().apply(mode === 'rotate' ? 'Rotate items' : 'Move items', (draft) => {
      const level = draft.levels.find((entry) => entry.id === storedLevel)
      if (!level) return
      for (const id of ids) {
        const item = level.items.find((entry) => entry.id === id)
        const origin = snapshot.get(id)
        if (!item || !origin || item.locked) continue
        if (id === activeId) {
          const elevation = object.position.y - elev
          const position = { x: object.position.x, y: object.position.z }
          const resolved = resolve
            ? resolveItemPose(
                level,
                { position, rotation: item.rotation, size: item.size, elevation, catalogId: item.catalogId },
                { ignore: ids },
              )
            : null
          if (resolved?.blocked) {
            // Boxed in: back to where the drag started rather than into the clip.
            item.position = { ...origin.position }
            item.elevation = origin.elevation
          } else {
            item.position = resolved ? resolved.position : position
            item.elevation = elevation
          }
          item.rotation = -object.rotation.y
        } else {
          item.position = { x: origin.position.x + dx, y: origin.position.y + dz }
          item.elevation = origin.elevation + dy
          item.rotation = origin.rotation - dYaw
        }
      }
    })
  }

  gizmo.addEventListener('dragging-changed', (event) => {
    orbitEnabled(!event.value)
  })
  gizmo.addEventListener('mouseDown', () => {
    const object = gizmo.object
    const level = selectActiveLevel(useStore.getState())
    if (!object || !level) return
    levelId = level.id
    levelElev = level.elevation
    start.copy(object.position)
    startYaw = object.rotation.y
    const selected = useStore.getState().selection
    dragIds = level.items.filter((item) => selected.includes(item.id) && !item.locked).map((item) => item.id)
    origins = new Map(
      dragIds.map((id) => {
        const item = level.items.find((entry) => entry.id === id) as Item
        return [id, { position: { ...item.position }, elevation: item.elevation, rotation: item.rotation }]
      }),
    )
  })
  gizmo.addEventListener('objectChange', preview)
  gizmo.addEventListener('mouseUp', () => {
    commit()
    dragIds = []
    origins = new Map()
    orbitEnabled(true)
  })
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)

  return {
    sync(project, state) {
      const show = (state.view === '3d' || state.view === 'split') && state.tool === 'select'
      const level = project.levels.find((entry) => entry.id === state.activeLevelId)
      const items = level?.items.filter((item) => state.selection.includes(item.id) && !item.locked) ?? []
      const active = items[items.length - 1]
      const attached = gizmo.object
      if (attached && !attached.parent) gizmo.detach()
      if (!show || !active) {
        gizmo.detach()
        helper.visible = false
        gizmo.enabled = false
        return
      }
      const root = findRoot(ctx.scene, active.id)
      if (!root || !root.parent) {
        gizmo.detach()
        helper.visible = false
        return
      }
      if (gizmo.dragging && gizmo.object === root) return
      if (gizmo.object && gizmo.object !== root) gizmo.detach()
      gizmo.attach(root)
      helper.visible = true
      gizmo.enabled = true
      applyMode()
    },
    dispose() {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      gizmo.detach()
      ctx.scene.remove(helper)
      gizmo.dispose()
      if (controls === gizmo) controls = null
    },
  }
}

registerSceneLayer({
  id: 'gizmo',
  create: createGizmoLayer,
})
