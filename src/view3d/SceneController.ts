import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { buildFloors } from '../builders/floors'
import { stairHoleOutline } from '../model/stairs'
import { buildItem } from '../builders/items'
import { buildOpening } from '../builders/openings'
import { buildWall } from '../builders/walls'
import type { Item, Level, Project } from '../model/types'
import { gizmoOwnsPointer, releaseGizmo } from './layers/gizmo'
import { paintFromHits, type ViewHit } from './paintPick'
import { pixelRatioCap, useSettings } from '../settings'
import { roomsFor, useStore } from '../store'
import { isPhotoMode } from '../ui/photoSession'
import { getRig, type CameraRig } from './rigs'
import { bindWalkScene } from './rigs/walk'
import { recordFrame } from './perfMonitor'
import { renderFrame } from './post/pipeline'
import {
  bindSceneHost,
  listSceneLayers,
  type SceneLayer,
  type SceneLayerContext,
  type SceneViewState,
} from './layers'
import './layers/builtin'
import './atmosphere'

export type { SceneViewState as ViewState } from './layers'

interface Press {
  x: number
  y: number
  hit: { id: string; kind: string } | null
  consumed: boolean
}

interface Bucket {
  group: THREE.Group
  structural: THREE.Group
  items: THREE.Group
  walls: Level['walls']
  openings: Level['openings']
  rooms: Level['rooms']
  belowStairs: Level['stairs'] | undefined
  roofs: Level['roofs']
  elevation: number
  height: number
  slab: number
  itemMap: Map<string, { source: Item; object: THREE.Object3D }>
}

let current: SceneController | null = null

function bindController(controller: SceneController | null): void {
  current = controller
}

export function getController(): SceneController | null {
  return current
}

let beforeRender: (() => boolean) | null = null

/** A flight (or similar) can own the camera for a frame by returning true. */
export function setBeforeRender(fn: () => boolean): void {
  beforeRender = fn
}

export class SceneController {
  readonly canvas: HTMLCanvasElement
  readonly scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer | null = null
  controls: OrbitControls | null = null

  private root = new THREE.Group()
  private helpers = new THREE.Group()
  private levels = new Map<string, Bucket>()
  private layers = new Map<string, SceneLayer>()
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private press: Press | null = null
  private rig: CameraRig | null = null
  private framedFor: string | null = null
  private pendingFrame = false
  private disposed = false
  private failed = false
  private raf = 0
  private lastTime = 0
  private elapsed = 0
  private signature: SceneViewState | null = null
  private seenProject: Project | null = null
  private unbindHost: (() => void) | null = null
  /** The compare pane must not steal the walk rig or the global controller. */
  private primary = true

  constructor(canvas: HTMLCanvasElement, options?: { primary?: boolean }) {
    this.primary = options?.primary !== false
    this.canvas = canvas
    this.scene = new THREE.Scene()
    this.scene.environmentIntensity = 0.48
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.2, 6000)
    this.camera.position.set(12, 10, 14)
    if (this.primary) bindController(this)
    try {
      // Keep the drawing buffer so a later pixel read (photo export, smoke test) is not blank.
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true })
    } catch {
      this.renderer = null
    }
    const renderer = this.renderer
    if (renderer) {
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 0.5
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFShadowMap
      renderer.setClearColor('#9ec4e4')
      if (this.primary) {
        // A multi-pass composer would otherwise keep only the last pass, because
        // three resets info at the start of each render. Read after renderFrame, then reset.
        renderer.info.autoReset = false
      }
    }

    if (renderer) {
      this.controls = new OrbitControls(this.camera, canvas)
      this.controls.enableDamping = true
      this.controls.dampingFactor = 0.08
      this.controls.maxPolarAngle = Math.PI * 0.48
      this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
      this.controls.target.set(5, 1, 4)
    }

    this.scene.add(this.root)
    this.scene.add(this.helpers)
    if (this.primary) bindWalkScene(() => (this.disposed ? null : this.root))
    this.unbindHost = bindSceneHost(this)
    this.mountAll()

    if (this.primary) {
      canvas.addEventListener('pointerdown', this.onDown, true)
      canvas.addEventListener('pointerup', this.onUp)
    }
    this.lastTime = performance.now()
    this.frameLoop()
  }

  /** Scene-layer host. Recreates one layer after replaceSceneLayer. */
  remountLayer(id: string): void {
    if (this.disposed) return
    this.mountLayer(id)
  }

  dispose(): void {
    this.disposed = true
    this.unbindHost?.()
    this.unbindHost = null
    cancelAnimationFrame(this.raf)
    if (this.primary) {
      this.canvas.removeEventListener('pointerdown', this.onDown, true)
      this.canvas.removeEventListener('pointerup', this.onUp)
    }
    this.rig?.deactivate?.()
    this.controls?.dispose()
    for (const layer of this.layers.values()) layer.dispose()
    this.layers.clear()
    this.clearLevels()
    this.renderer?.dispose()
    if (current === this) bindController(null)
  }

  exportRoot(): THREE.Object3D {
    return this.root
  }

  /** Distance from the camera to the first solid hit. Used by photo focus. */
  distanceAt(clientX: number, clientY: number): number | null {
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return null
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    let hits: THREE.Intersection[]
    try {
      hits = this.raycaster.intersectObjects(this.scene.children, true)
    } catch {
      return null
    }
    for (const hit of hits) {
      if (!hit.object.visible) continue
      let skip = false
      let obj: THREE.Object3D | null = hit.object
      while (obj) {
        if (obj.name === 'sky' || obj.name === 'stars' || obj.name === 'clouds' || obj.name === 'precip' || obj.name === 'rain' || obj.name === 'snow') {
          skip = true
          break
        }
        obj = obj.parent
      }
      if (skip) continue
      return hit.distance
    }
    return null
  }

  pose(): { pos: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } } | null {
    if (!this.controls || this.disposed) return null
    return {
      pos: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      target: { x: this.controls.target.x, y: this.controls.target.y, z: this.controls.target.z },
    }
  }

  matchPose(pose: { pos: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } }): void {
    if (!this.controls || this.disposed) return
    const { pos, target } = pose
    if (![pos.x, pos.y, pos.z, target.x, target.y, target.z].every((value) => Number.isFinite(value))) return
    const same =
      Math.abs(this.camera.position.x - pos.x) < 1e-4 &&
      Math.abs(this.camera.position.y - pos.y) < 1e-4 &&
      Math.abs(this.camera.position.z - pos.z) < 1e-4 &&
      Math.abs(this.controls.target.x - target.x) < 1e-4 &&
      Math.abs(this.controls.target.y - target.y) < 1e-4 &&
      Math.abs(this.controls.target.z - target.z) < 1e-4
    if (same) return
    this.camera.position.set(pos.x, pos.y, pos.z)
    this.controls.target.set(target.x, target.y, target.z)
    this.controls.update()
  }

  frameAt(point: { x: number; y: number; z: number }): void {
    if (!this.controls || this.disposed) return
    if (![point.x, point.y, point.z].every((value) => Number.isFinite(value))) return
    this.controls.target.set(point.x, point.y, point.z)
    this.camera.position.set(point.x + 6, point.y + 5, point.z + 7)
    this.controls.update()
  }

  /** Frame the visible levels' walls from a three-quarter elevated view. */
  frame(): void {
    if (!this.seenProject) return
    this.framedFor = this.seenProject.id
    this.frameOn(this.seenProject, this.signature)
  }

  sync(project: Project, state: SceneViewState): void {
    if (!this.renderer || this.disposed) return
    const prev = this.signature
    if (
      this.seenProject === project &&
      prev &&
      prev.activeLevelId === state.activeLevelId &&
      prev.levelDisplay === state.levelDisplay &&
      prev.view === state.view &&
      prev.tool === state.tool &&
      prev.selection === state.selection
    ) {
      return
    }
    this.seenProject = project
    this.reconcile(project)
    this.applyVisibility(project, state)
    this.updateHelpers(state.selection)
    for (const layer of this.eachLayer()) layer.sync(project, state)
    this.syncRig(state.view)
    if (this.framedFor !== project.id) {
      this.framedFor = project.id
      this.frameOn(project, state)
    }
    this.signature = { ...state, selection: state.selection }
  }

  private mountAll(): void {
    for (const def of listSceneLayers()) this.mountLayer(def.id)
  }

  private mountLayer(id: string): void {
    const def = listSceneLayers().find((layer) => layer.id === id)
    if (!def) return
    this.layers.get(id)?.dispose()
    const created = def.create(this.layerContext())
    this.layers.set(id, created)
    if (this.seenProject && this.signature) created.sync(this.seenProject, this.signature)
  }

  private layerContext(): SceneLayerContext {
    return {
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      controller: this,
    }
  }

  private eachLayer(): SceneLayer[] {
    const out: SceneLayer[] = []
    for (const def of listSceneLayers()) {
      const layer = this.layers.get(def.id)
      if (layer) out.push(layer)
    }
    return out
  }

  private reconcile(project: Project): void {
    releaseGizmo()
    const live = new Set(project.levels.map((level) => level.id))
    for (const [id, bucket] of this.levels) {
      if (live.has(id)) continue
      this.root.remove(bucket.group)
      disposeTree(bucket.group)
      this.levels.delete(id)
    }
    for (const level of project.levels) {
      let bucket = this.levels.get(level.id)
      if (!bucket) {
        bucket = emptyBucket()
        this.levels.set(level.id, bucket)
        this.root.add(bucket.group)
      }
      const below = levelBelow(project, level)
      const belowStairs = below?.stairs
      const same =
        bucket.walls === level.walls &&
        bucket.openings === level.openings &&
        bucket.rooms === level.rooms &&
        bucket.elevation === level.elevation &&
        bucket.height === level.height &&
        bucket.slab === level.slabThickness &&
        bucket.belowStairs === belowStairs &&
        bucket.roofs === level.roofs
      if (!same) {
        disposeTree(bucket.structural)
        bucket.structural.clear()
        for (const wall of level.walls) {
          bucket.structural.add(buildWall(wall, level, level.walls))
          if (wall.kind === 'railing') continue
          for (const opening of level.openings) {
            if (opening.wallId === wall.id) bucket.structural.add(buildOpening(opening, wall, level.elevation))
          }
        }
        bucket.structural.add(
          buildFloors(level, roomsFor(level), {
            holes: (belowStairs ?? []).map((stair) => stairHoleOutline(stair)),
            upper: !!below,
            skipCeiling: level.roofs.length > 0,
          }),
        )
        bucket.walls = level.walls
        bucket.belowStairs = belowStairs
        bucket.roofs = level.roofs
        bucket.openings = level.openings
        bucket.rooms = level.rooms
        bucket.elevation = level.elevation
        bucket.height = level.height
        bucket.slab = level.slabThickness
      }
      this.syncItems(bucket, level)
    }
  }

  private syncItems(bucket: Bucket, level: Level): void {
    const seen = new Set<string>()
    for (const item of level.items) {
      seen.add(item.id)
      const prev = bucket.itemMap.get(item.id)
      if (prev?.source === item) continue
      if (prev) {
        bucket.items.remove(prev.object)
        disposeTree(prev.object)
      }
      const object = buildItem(item)
      object.position.y = level.elevation + item.elevation
      bucket.items.add(object)
      bucket.itemMap.set(item.id, { source: item, object })
    }
    for (const [id, prev] of bucket.itemMap) {
      if (seen.has(id)) continue
      bucket.items.remove(prev.object)
      disposeTree(prev.object)
      bucket.itemMap.delete(id)
    }
  }

  private applyVisibility(project: Project, state: SceneViewState): void {
    const active = project.levels.find((level) => level.id === state.activeLevelId)
    const elev = active?.elevation ?? 0
    for (const level of project.levels) {
      const bucket = this.levels.get(level.id)
      if (!bucket) continue
      const above = level.elevation > elev + 1e-3
      let visible = true
      if (state.levelDisplay !== 'all' && above) visible = false
      if (state.levelDisplay === 'current' && level.id !== state.activeLevelId) visible = false
      bucket.group.visible = visible
      const cutaway = level.id === state.activeLevelId && state.tool !== 'paint'
      bucket.structural.traverse((obj) => {
        if (obj.userData.ceiling || obj.userData.roof) obj.visible = !cutaway
      })
    }
  }

  private updateHelpers(selection: readonly string[]): void {
    for (const child of [...this.helpers.children]) {
      this.helpers.remove(child)
      const helper = child as THREE.BoxHelper
      helper.geometry?.dispose()
    }
    const wanted = new Set(selection)
    this.root.traverse((obj) => {
      const id = obj.userData.entityId
      if (typeof id !== 'string' || !wanted.has(id)) return
      if (obj.parent?.userData.entityId === id) return
      const helper = new THREE.BoxHelper(obj, 0x3fb8af)
      this.helpers.add(helper)
    })
  }

  private frameOn(project: Project, state: SceneViewState | null): void {
    if (!this.controls) return
    if (this.canvas.clientWidth < 2 || this.canvas.clientHeight < 2) {
      this.pendingFrame = true
      return
    }
    this.pendingFrame = false
    const box = visibleWallBounds(project, state)
    const sphere = new THREE.Sphere()
    box.getBoundingSphere(sphere)
    sphere.radius = Math.max(sphere.radius, 2.5)
    const aspect = this.camera.aspect > 0.05 ? this.camera.aspect : 1
    const vFov = THREE.MathUtils.degToRad(this.camera.fov)
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect)
    const dist = Math.max(sphere.radius / Math.sin(vFov / 2), sphere.radius / Math.sin(hFov / 2)) * 1.35
    const pitch = 0.46
    const yaw = Math.PI / 4.2
    const horiz = Math.cos(pitch)
    this.controls.target.copy(sphere.center)
    this.camera.position.set(
      sphere.center.x + dist * horiz * Math.sin(yaw),
      sphere.center.y + dist * Math.sin(pitch),
      sphere.center.z + dist * horiz * Math.cos(yaw),
    )
    this.controls.update()
  }

  private syncRig(view: SceneViewState['view']): void {
    const next = view === 'walk' ? (getRig('walk') ?? null) : null
    if (next === this.rig) return
    this.rig?.deactivate?.()
    this.rig = next
    if (this.rig) {
      if (this.controls) this.controls.enabled = false
      this.rig.activate?.(this.camera, this.canvas)
    } else if (this.controls && !gizmoOwnsPointer()) {
      this.controls.enabled = true
    }
  }

  private frameLoop = () => {
    if (this.disposed || this.failed || !this.renderer) return
    this.raf = requestAnimationFrame(this.frameLoop)
    const now = performance.now()
    const rawMs = now - this.lastTime
    const dt = Math.min(0.1, Math.max(0, rawMs) / 1000)
    this.lastTime = now
    this.elapsed += dt
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (width < 2 || height < 2) return
    try {
      if (this.pendingFrame && this.seenProject) this.frameOn(this.seenProject, this.signature)
      const cap = pixelRatioCap(useSettings.getState().graphicsQuality)
      const ratio = Math.min(window.devicePixelRatio || 1, cap)
      if (
        this.canvas.width !== Math.floor(width * ratio) ||
        this.camera.aspect !== width / height ||
        this.renderer.getPixelRatio() !== ratio
      ) {
        this.renderer.setPixelRatio(ratio)
        this.renderer.setSize(width, height, false)
        this.camera.aspect = width / height
        this.camera.updateProjectionMatrix()
      }
      const flightOwns = beforeRender?.() ?? false
      if (!flightOwns) {
        if (this.rig) this.rig.update?.(dt)
        else {
          const sens = useSettings.getState().mouseSensitivity
          if (this.controls && Number.isFinite(sens) && sens > 0) this.controls.rotateSpeed = sens
          this.controls?.update()
        }
      }
      for (const layer of this.eachLayer()) layer.update?.(dt, this.elapsed)
      for (const child of this.helpers.children) {
        const helper = child as THREE.BoxHelper
        helper.update()
      }
      renderFrame(this.renderer, this.scene, this.camera)
      if (this.primary) recordFrame(this.renderer, this.scene, rawMs)
    } catch (err) {
      this.failed = true
      console.error(err)
    }
  }

  private onDown = (e: PointerEvent) => {
    if (isPhotoMode()) return
    if (e.button !== 0 || !this.renderer) return
    if (e.altKey) {
      this.paintPointer(e, true)
      e.preventDefault()
      e.stopPropagation()
      return
    }
    const state = useStore.getState()
    if (state.tool === 'paint' && state.view !== 'walk') {
      this.paintPointer(e, false)
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (gizmoOwnsPointer()) {
      if (this.controls) this.controls.enabled = false
      return
    }
    if (state.tool !== 'select' || state.view === 'walk') return
    const hit = this.pick(e)
    this.press = { x: e.clientX, y: e.clientY, hit, consumed: false }
    if (hit?.kind !== 'item') return
    if (e.shiftKey) state.select([hit.id], true)
    else if (!state.selection.includes(hit.id)) state.select([hit.id])
    this.press.consumed = true
    if (this.controls) this.controls.enabled = false
    e.preventDefault()
    e.stopPropagation()
  }

  private onUp = (e: PointerEvent) => {
    if (this.controls && !this.rig && !gizmoOwnsPointer()) this.controls.enabled = true
    const press = this.press
    this.press = null
    if (!press || press.consumed || e.button !== 0) return
    if (useStore.getState().tool !== 'select') return
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 4) return
    if (!press.hit) {
      if (!e.shiftKey) useStore.getState().select([])
      return
    }
    useStore.getState().select([press.hit.id], e.shiftKey)
  }

  private paintPointer(e: PointerEvent, eyedrop: boolean): void {
    if (!this.ndc(e)) return
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObject(this.root, true)
    const mapped: ViewHit[] = []
    for (const hit of hits) {
      const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : null
      mapped.push({ object: hit.object, normal })
    }
    paintFromHits(useStore.getState().activeLevelId, mapped, eyedrop, e.shiftKey)
  }

  private pick(e: PointerEvent): { id: string; kind: string } | null {
    if (!this.ndc(e)) return null
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObject(this.root, true)
    for (const hit of hits) {
      const ids = hit.object.userData.instanceIds
      if (typeof hit.instanceId === 'number' && Array.isArray(ids)) {
        const id = ids[hit.instanceId]
        if (typeof id === 'string') return { id, kind: String(hit.object.userData.kind ?? 'plant') }
      }
      let obj: THREE.Object3D | null = hit.object
      while (obj && obj !== this.root) {
        const id = obj.userData.entityId
        if (typeof id === 'string') return { id, kind: String(obj.userData.kind ?? '') }
        obj = obj.parent
      }
    }
    return null
  }

  private ndc(e: PointerEvent): boolean {
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return false
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    return true
  }

  private clearLevels(): void {
    for (const bucket of this.levels.values()) disposeTree(bucket.group)
    this.levels.clear()
  }
}

function emptyBucket(): Bucket {
  const group = new THREE.Group()
  const structural = new THREE.Group()
  const items = new THREE.Group()
  group.add(structural)
  group.add(items)
  return {
    group,
    structural,
    items,
    walls: [],
    openings: [],
    rooms: [],
    belowStairs: undefined,
    roofs: [],
    elevation: Number.NaN,
    height: Number.NaN,
    slab: Number.NaN,
    itemMap: new Map(),
  }
}

function levelBelow(project: Project, level: Level): Level | null {
  let below: Level | null = null
  for (const other of project.levels) {
    if (other.id === level.id) continue
    if (other.elevation < level.elevation - 1e-4 && (!below || other.elevation > below.elevation)) below = other
  }
  return below
}

function expandWalls(box: THREE.Box3, project: Project, include: (level: Level) => boolean): boolean {
  let any = false
  for (const level of project.levels) {
    if (!include(level)) continue
    for (const wall of level.walls) {
      any = true
      box.expandByPoint(new THREE.Vector3(wall.a.x, level.elevation, wall.a.y))
      box.expandByPoint(new THREE.Vector3(wall.b.x, level.elevation + wall.height, wall.b.y))
    }
  }
  return any
}

function visibleWallBounds(project: Project, state: SceneViewState | null): THREE.Box3 {
  const box = new THREE.Box3()
  const active = state ? project.levels.find((level) => level.id === state.activeLevelId) : undefined
  const elev = active?.elevation ?? 0
  const filtered = expandWalls(box, project, (level) => {
    if (!state) return true
    const above = level.elevation > elev + 1e-3
    if (state.levelDisplay !== 'all' && above) return false
    if (state.levelDisplay === 'current' && level.id !== state.activeLevelId) return false
    return true
  })
  if (filtered) return box
  const all = new THREE.Box3()
  if (expandWalls(all, project, () => true)) return all
  const boundary = project.terrain?.boundary
  if (Array.isArray(boundary) && boundary.length >= 3) {
    const plot = new THREE.Box3()
    for (const point of boundary) {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
      plot.expandByPoint(new THREE.Vector3(point.x, 0, point.y))
      plot.expandByPoint(new THREE.Vector3(point.x, 2, point.y))
    }
    if (!plot.isEmpty()) return plot
  }
  const width = project.terrain?.width
  const depth = project.terrain?.depth
  if (Number.isFinite(width) && Number.isFinite(depth) && (width ?? 0) > 1 && (depth ?? 0) > 1) {
    const halfW = (width ?? 0) / 2
    const halfD = (depth ?? 0) / 2
    box.set(new THREE.Vector3(-halfW, 0, -halfD), new THREE.Vector3(halfW, 3, halfD))
    return box
  }
  box.set(new THREE.Vector3(-4, 0, -4), new THREE.Vector3(4, 3, 4))
  return box
}

function disposeTree(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh
    mesh.geometry?.dispose()
    const listed = mesh.material
    const materials = Array.isArray(listed) ? listed : listed ? [listed] : []
    for (const material of materials) {
      if (!material.userData?.owned) continue
      const standard = material as THREE.MeshStandardMaterial
      if (standard.map?.userData?.owned) standard.map.dispose()
      material.dispose()
    }
  })
}
