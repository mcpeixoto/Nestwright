import * as THREE from 'three'
import { getEntry } from '../../catalog/registry'
import { isPassableOpening, levelObstacles, rectFootprint, type Footprint } from '../../model/collision'
import { integrateWalk } from '../../model/walkMove'
import { pointInPolygon } from '../../model/geometry'
import type { Item, Level, Project, Stair } from '../../model/types'
import { useSettings } from '../../settings'
import { roomsFor, useStore, type ViewMode } from '../../store'
import { isPhotoMode } from '../../ui/photoSession'
import { registerRig } from '../rigs'

const EYE = 1.65
const CAT_EYE = 0.25
const RADIUS = 0.22
const GRAVITY = 9.81

let returnView: ViewMode = '3d'
let sceneOf: (() => THREE.Object3D | null) | null = null
let fps = 0

const doorTarget = new Map<string, number>()
const doorNow = new Map<string, number>()

export function noteReturnView(view: ViewMode): void {
  if (view !== 'walk') returnView = view
}

export function leaveWalk(): void {
  useStore.getState().setView(returnView === 'walk' ? '3d' : returnView)
}

export function bindWalkScene(fn: () => THREE.Object3D | null): void {
  sceneOf = fn
}

export function readFps(): number {
  return fps
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable
}

/** Local ramp when model/stairs.ts is not in this worktree. Straight, L and U share one run; spirals wind once. */
function stairHeightAt(stair: Stair, level: Level, x: number, y: number): number | null {
  const rise = stair.rise > 0 ? stair.rise : level.height
  if (!(rise > 0)) return null
  const dx = x - stair.position.x
  const dy = y - stair.position.y
  const c = Math.cos(stair.rotation)
  const s = Math.sin(stair.rotation)
  const lx = dx * c + dy * s
  const ly = -dx * s + dy * c
  if (stair.shape === 'spiral') {
    const radius = Math.hypot(lx, ly)
    if (radius > Math.max(0.45, stair.width)) return null
    const turns = (Math.atan2(ly, lx) + Math.PI) / (Math.PI * 2)
    return level.elevation + turns * rise
  }
  const steps = Math.max(1, Math.ceil(rise / 0.18))
  const length = steps * 0.26 * (stair.shape === 'straight' ? 1 : 1.7)
  if (Math.abs(lx) > stair.width / 2 + 0.1) return null
  if (ly < -0.08 || ly > length + 0.08) return null
  const u = Math.min(1, Math.max(0, ly / length))
  return level.elevation + u * rise
}

function insideItem(item: Item, x: number, y: number): boolean {
  const dx = x - item.position.x
  const dy = y - item.position.y
  const c = Math.cos(item.rotation)
  const s = Math.sin(item.rotation)
  const lx = dx * c + dy * s
  const ly = -dx * s + dy * c
  return Math.abs(lx) <= item.size.w / 2 && Math.abs(ly) <= item.size.d / 2
}

interface Support {
  y: number
  levelId: string
}

function supportAt(project: Project, x: number, y: number, feet: number, rising: boolean, cat: boolean): Support {
  const snap = rising ? 0.06 : cat ? 0.22 : 0.32
  const point = { x, y }
  let bestY = 0
  let bestId = project.levels.find((level) => Math.abs(level.elevation) < 1e-3)?.id ?? project.levels[0]?.id ?? ''
  for (const level of project.levels) {
    let onRoom = false
    for (const room of roomsFor(level)) {
      if (pointInPolygon(point, room.polygon)) {
        onRoom = true
        break
      }
    }
    if (onRoom && level.elevation <= feet + snap && level.elevation >= bestY - 1e-4) {
      bestY = level.elevation
      bestId = level.id
    }
    for (const stair of level.stairs) {
      const height = stairHeightAt(stair, level, x, y)
      if (height == null || height > feet + snap) continue
      if (height > bestY + 1e-4) {
        bestY = height
        bestId = level.id
      }
    }
    if (!cat) continue
    for (const item of level.items) {
      if (item.size.h < 0.12 || !insideItem(item, x, y)) continue
      const top = level.elevation + item.elevation + item.size.h
      if (top <= feet + snap && top > bestY + 1e-4) {
        bestY = top
        bestId = level.id
      }
    }
  }
  return { y: bestY, levelId: bestId }
}

function blockingFurniture(level: Level, feetY: number, cat: boolean): Footprint[] {
  const out: Footprint[] = []
  for (const item of level.items) {
    if (item.size.h < 0.15) continue
    if (!cat && item.size.h <= 0.4) continue
    const top = level.elevation + item.elevation + item.size.h
    const bottom = level.elevation + item.elevation
    if (feetY >= top - 0.08) continue
    if (feetY + (cat ? 0.45 : 1.6) < bottom) continue
    out.push(rectFootprint(item.position, Math.max(0.05, item.size.w), Math.max(0.05, item.size.d), item.rotation))
  }
  return out
}

function entityOf(obj: THREE.Object3D): { id: string; kind: string; openingType: string } | null {
  let current: THREE.Object3D | null = obj
  while (current) {
    const id = current.userData.entityId
    const kind = current.userData.kind
    if (typeof id === 'string' && typeof kind === 'string') {
      const openingType = typeof current.userData.openingType === 'string' ? current.userData.openingType : ''
      return { id, kind, openingType }
    }
    current = current.parent
  }
  return null
}

function tickDoors(root: THREE.Object3D, dt: number): void {
  root.traverse((obj) => {
    const id = obj.userData.doorLeaf
    if (typeof id !== 'string') return
    const target = doorTarget.get(id) ?? 0
    const current = doorNow.get(id) ?? 0
    const next = current + (target - current) * Math.min(1, dt * 5)
    doorNow.set(id, next)
    const sign = typeof obj.userData.hingeSign === 'number' ? obj.userData.hingeSign : 1
    obj.rotation.y = next * sign * (Math.PI * 0.55)
  })
}

let camera: THREE.PerspectiveCamera | null = null
let canvas: HTMLCanvasElement | null = null
let feetX = 0
let feetZ = 0
let feetY = 0
let vy = 0
let yaw = 0
let pitch = 0
let cat = false
let grounded = true
let savedNear = 0.2
let lookDrag = false
let lookX = 0
let lookY = 0
const keys = new Set<string>()

function eyeHeight(): number {
  return cat ? CAT_EYE : EYE
}

function jumpSpeed(): number {
  const height = cat ? 1.2 : 0.45
  return Math.sqrt(2 * GRAVITY * height)
}

function interact(): void {
  if (!camera) return
  const root = sceneOf?.()
  if (!root) return
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)
  raycaster.far = 3
  let hits: THREE.Intersection[]
  try {
    hits = raycaster.intersectObject(root, true)
  } catch {
    return
  }
  for (const hit of hits) {
    if (hit.distance > 3) break
    const entity = entityOf(hit.object)
    if (!entity) continue
    if (entity.kind === 'item') {
      const state = useStore.getState()
      const level = state.project.levels.find((item) => item.id === state.activeLevelId)
      const item = level?.items.find((entry) => entry.id === entity.id)
      if (!item || !getEntry(item.catalogId)?.light) continue
      state.apply('Toggle lamp', (draft) => {
        const target = draft.levels.find((entry) => entry.id === state.activeLevelId)
        const lamp = target?.items.find((entry) => entry.id === entity.id)
        if (!lamp) return
        lamp.lightOn = lamp.lightOn === false
      })
      return
    }
    if (entity.kind === 'opening' && isPassableOpening(entity.openingType)) {
      const next = (doorTarget.get(entity.id) ?? 0) > 0.5 ? 0 : 1
      doorTarget.set(entity.id, next)
      return
    }
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (isTyping(event.target) || isPhotoMode()) return
  if (event.code === 'Escape') {
    leaveWalk()
    return
  }
  if (event.repeat) return
  if (event.code === 'KeyE') {
    interact()
    event.preventDefault()
    return
  }
  if (event.code === 'KeyC') {
    cat = !cat
    event.preventDefault()
    return
  }
  if (event.code === 'Space') {
    if (grounded) {
      vy = jumpSpeed()
      grounded = false
    }
    event.preventDefault()
    return
  }
  keys.add(event.code)
  if (event.code.startsWith('Key') || event.code.startsWith('Arrow')) event.preventDefault()
}

function onKeyUp(event: KeyboardEvent): void {
  keys.delete(event.code)
}

function lookBy(dx: number, dy: number, scale: number): void {
  const settings = useSettings.getState()
  const sens = Number.isFinite(settings.mouseSensitivity) && settings.mouseSensitivity > 0 ? settings.mouseSensitivity : 1
  yaw -= dx * scale * sens
  pitch += (settings.invertY ? 1 : -1) * dy * scale * sens
  pitch = Math.max(-1.2, Math.min(1.2, pitch))
}

function onPointerMove(event: PointerEvent): void {
  if (!canvas) return
  if (document.pointerLockElement === canvas) {
    lookBy(event.movementX, event.movementY, 0.0022)
    return
  }
  if (!lookDrag) return
  lookBy(event.clientX - lookX, event.clientY - lookY, 0.005)
  lookX = event.clientX
  lookY = event.clientY
}

function onPointerDown(event: PointerEvent): void {
  if (!canvas || isPhotoMode() || event.button !== 0) return
  lookDrag = true
  lookX = event.clientX
  lookY = event.clientY
  if (document.pointerLockElement === canvas) return
  try {
    const lock = canvas.requestPointerLock?.() as Promise<void> | undefined
    if (lock && typeof lock.then === 'function') {
      void lock.catch(() => {
        /* embedded browsers reject the lock; drag-look stays active */
      })
    }
  } catch {
    /* WrongDocumentError: keep click-drag look */
  }
}

function onPointerUp(): void {
  lookDrag = false
}

function applyCamera(): void {
  if (!camera) return
  camera.position.set(feetX, feetY + eyeHeight(), feetZ)
  camera.rotation.order = 'YXZ'
  camera.rotation.y = yaw
  camera.rotation.x = pitch
  camera.rotation.z = 0
}

registerRig({
  id: 'walk',
  activate(next, nextCanvas) {
    camera = next
    canvas = nextCanvas
    savedNear = next.near
    next.near = 0.08
    next.updateProjectionMatrix()
    const state = useStore.getState()
    feetX = next.position.x
    feetZ = next.position.z
    yaw = next.rotation.y
    pitch = THREE.MathUtils.clamp(next.rotation.x, -1.2, 1.2)
    const support = supportAt(state.project, feetX, feetZ, next.position.y, false, cat)
    feetY = support.y
    vy = 0
    grounded = true
    applyCamera()
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    nextCanvas.addEventListener('pointerdown', onPointerDown)
  },
  deactivate() {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    canvas?.removeEventListener('pointerdown', onPointerDown)
    lookDrag = false
    if (canvas && document.pointerLockElement === canvas) document.exitPointerLock?.()
    keys.clear()
    if (camera) {
      camera.near = savedNear
      camera.updateProjectionMatrix()
    }
    camera = null
    canvas = null
  },
  update(dt) {
    if (!camera || isPhotoMode()) return
    const step = Math.min(0.05, Math.max(0, dt))
    if (step > 0) fps = fps * 0.85 + (1 / step) * 0.15
    const state = useStore.getState()
    const forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0)
    const strafe = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0)
    const run = keys.has('ShiftLeft') || keys.has('ShiftRight')
    const speed = (cat ? 2.5 : 1.55) * (run ? 2.3 : 1)
    const active = state.project.levels.find((level) => level.id === state.activeLevelId)
    const supportGuess = supportAt(state.project, feetX, feetZ, feetY, vy > 0, cat)
    const levels = new Map<string, Level>()
    if (active) levels.set(active.id, active)
    const standing = state.project.levels.find((level) => level.id === supportGuess.levelId)
    if (standing) levels.set(standing.id, standing)
    const segments = [...levels.values()].flatMap((level) => levelObstacles(level))
    const footprints = [...levels.values()].flatMap((level) => blockingFurniture(level, feetY, cat))
    const moved = integrateWalk({
      x: feetX,
      y: feetZ,
      yaw,
      forward,
      strafe,
      speed,
      dt: step,
      radius: RADIUS,
      segments,
      footprints,
    })
    feetX = moved.x
    feetZ = moved.y
    vy -= GRAVITY * step
    const nextFeet = feetY + vy * step
    const support = supportAt(state.project, feetX, feetZ, Math.max(feetY, nextFeet), vy > 0.05, cat)
    if (nextFeet <= support.y) {
      feetY = support.y
      vy = 0
      grounded = true
      if (support.levelId && support.levelId !== state.activeLevelId) state.setActiveLevel(support.levelId)
    } else {
      feetY = nextFeet
      grounded = false
    }
    applyCamera()
    const root = sceneOf?.()
    if (root) tickDoors(root, step)
  },
})
