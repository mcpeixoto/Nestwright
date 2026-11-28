import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { buildFloors } from '../builders/floors'
import { stairHoleOutline } from '../model/stairs'
import { contactShadowFor, releaseContactShadow, CONTACT } from '../builders/contactShadow'
import { buildItem } from '../builders/items'
import { isFlatItem, itemFootprint } from '../model/clearance'
import { pointInPolygon } from '../model/geometry'
import { isSharedGeometry, modelFor, modelsLoading, releaseModelGeometry, subscribeModels } from '../catalog/models'
import { ModelInstancer } from './modelInstances'
import { buildOpening } from '../builders/openings'
import { buildWall } from '../builders/walls'
import { diffWalls } from './wallDiff'
import { resolveTrim } from '../model/trim'
import type { Item, Level, Project } from '../model/types'
import { gizmoOwnsPointer, releaseGizmo } from './layers/gizmo'
import { paintFromHits, type ViewHit } from './paintPick'
import { useSettings } from '../settings'
import { roomsFor, useStore } from '../store'
import { isPhotoMode } from '../ui/photoSession'
import { getRig, type CameraRig } from './rigs'
import { bindWalkScene } from './rigs/walk'
import { recordFrame, setPerfExtra, type PerfRenderer } from './perfMonitor'
import { setPbrRenderer } from '../materials/pbrTextures'
import { ENV_INTENSITY } from './atmosphere/skyParams'
import { activeTone, toneMappingFor } from './atmosphere/toneMap'
import { PostPipeline } from './post/pipeline'
import { backendPreference, createRenderer, type RendererBackend } from './render/createRenderer'
import { scheduleAutoTier } from './render/autoTierRunner'
import { holdRendering } from './render/hold'
import { renderPixelRatio } from './render/quality'
import type { GraphicsQuality } from '../settings'
import { captureCanvas, samplePoints, type PixelSample, type SamplePoint } from './render/readback'
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
  trim: Level['trim']
  /** The storey above sets the ceiling line the wall trim follows. */
  aboveWalls: Level['walls'] | undefined
  aboveSlab: number | undefined
  /** Lowest storey (ties included). Flipping it rebuilds the walls so the plinth comes and goes. */
  ground: boolean
  elevation: number
  height: number
  slab: number
  /** Baked contact-shadow decals, apart from the items so picking and bounds never see them. */
  shadows: THREE.Group
  itemMap: Map<string, { source: Item; object: THREE.Object3D; scanned: boolean; shadow: THREE.Mesh | null }>
  instancer: ModelInstancer
  /** Per wall: its group plus its opening groups, so one wall edit rebuilds only what it touched. */
  wallObjects: Map<string, THREE.Object3D[]>
  floorObject: THREE.Object3D | null
}

/** Longest a batch of model loads waits for the rest before swapping in what has arrived. */
const MODEL_SWAP_WAIT_MS = 1500

let current: SceneController | null = null

/**
 * Longest a precompile may hold frames back. Rendering before compileAsync returns is unsafe
 * (it leaves the scene pass MRT set on the renderer), so this is only a guard against a hang.
 */
const PRECOMPILE_CAP_MS = 60_000

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
  /** Null until `ready` resolves (and for good if neither WebGPU nor WebGL2 starts). */
  renderer: THREE.WebGPURenderer | null = null
  backend: RendererBackend | null = null
  controls: OrbitControls | null = null
  /** Resolves true once the renderer is initialised and the frame loop runs. */
  readonly ready: Promise<boolean>

  private root = new THREE.Group()
  private helpers = new THREE.Group()
  private levels = new Map<string, Bucket>()
  /** Wall/opening/floor rebuild cost of the last reconcile that rebuilt anything (perf report extras). */
  private lastRebuildMs = 0
  private lastWallsRebuilt = 0
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
  private post: PostPipeline | null = null
  private queued: { project: Project; state: SceneViewState } | null = null
  /** The first-run tier benchmark owns the GPU; the frame loop only keeps ticking. */
  private benchmarking = false
  /** Pipelines are compiling off-thread; frames are held (the canvas keeps the last one). */
  private compiling = false
  private compileWanted = true
  private compiledProject: string | null = null
  private compiledChain = ''
  private framesRendered = 0
  private compileDone: Promise<void> | null = null
  /** A model finished loading at this time and its placeholders are not swapped yet. */
  private modelsWaitingSince: number | null = null
  /** Set while `swapModels` re-syncs, so unchanged items with a new model rebuild. */
  private modelsArrived = false
  private unsubscribeModels: (() => void) | null = null

  constructor(canvas: HTMLCanvasElement, options?: { primary?: boolean }) {
    this.primary = options?.primary !== false
    this.canvas = canvas
    this.scene = new THREE.Scene()
    this.scene.environmentIntensity = ENV_INTENSITY
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.2, 6000)
    this.camera.position.set(12, 10, 14)
    if (this.primary) bindController(this)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.maxPolarAngle = Math.PI * 0.48
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
    this.controls.target.set(5, 1, 4)

    this.scene.add(this.root)
    this.scene.add(this.helpers)
    if (this.primary) bindWalkScene(() => (this.disposed ? null : this.root))

    if (this.primary) {
      canvas.addEventListener('pointerdown', this.onDown, true)
      canvas.addEventListener('pointerup', this.onUp)
      setPerfExtra('instancing', () => this.instancingStats())
      setPerfExtra('structuralRebuildMs', () => Math.round(this.lastRebuildMs * 100) / 100)
      setPerfExtra('structuralWallsRebuilt', () => this.lastWallsRebuilt)
    }
    this.unsubscribeModels = subscribeModels(() => {
      this.modelsWaitingSince ??= performance.now()
    })
    this.ready = this.start()
  }

  /** Async renderer init. Layers mount only after it, so each one sees a live renderer. */
  private async start(): Promise<boolean> {
    const search = typeof location === 'undefined' ? '' : location.search
    const preference = backendPreference(useSettings.getState().backend, search)
    let created: Awaited<ReturnType<typeof createRenderer>> = null
    try {
      created = await createRenderer(this.canvas, preference)
    } catch (err) {
      console.warn(err)
    }
    if (this.disposed) {
      created?.renderer.dispose()
      return false
    }
    if (!created) {
      this.failed = true
      return false
    }
    const renderer = created.renderer
    this.renderer = renderer
    this.backend = created.backend
    setPbrRenderer(renderer)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = toneMappingFor(activeTone())
    renderer.toneMappingExposure = 0.5
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.setClearColor('#9ec4e4')
    // A post chain renders several passes per frame. Read the totals after it, then reset.
    renderer.info.autoReset = false
    this.post = new PostPipeline(renderer, this.scene, this.camera, this.primary ? { post: true } : { post: false, tier: 'low' })

    this.unbindHost = bindSceneHost(this)
    this.mountAll()
    const queued = this.queued
    this.queued = null
    if (queued) this.sync(queued.project, queued.state)
    this.lastTime = performance.now()
    this.frameLoop()
    if (this.primary) scheduleAutoTier(this)
    return true
  }

  isDisposed(): boolean {
    return this.disposed
  }

  private instancingStats(): { batches: number; instanced: number; singles: number } {
    const total = { batches: 0, instanced: 0, singles: 0 }
    for (const bucket of this.levels.values()) {
      const s = bucket.instancer.stats()
      total.batches += s.batches
      total.instanced += s.instanced
      total.singles += s.singles
    }
    return total
  }

  setBenchmarking(on: boolean): void {
    this.benchmarking = on
  }

  /** One frame on `tier`'s profile (render scale and post chain), for the tier benchmark. */
  benchmarkFrame(tier: GraphicsQuality): void {
    if (!this.renderer || !this.post || this.disposed) return
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (width < 2 || height < 2) return
    const ratio = renderPixelRatio(window.devicePixelRatio || 1, tier, 0)
    if (this.renderer.getPixelRatio() !== ratio) {
      this.renderer.setPixelRatio(ratio)
      this.renderer.setSize(width, height, false)
    }
    this.post.render(tier)
    this.renderer.info.reset()
  }

  /** Benchmark host: compile `tier`'s chain at its render scale before the timed frames. */
  async prepareTier(tier: GraphicsQuality): Promise<void> {
    if (!this.renderer || !this.post || this.disposed) return
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (width < 2 || height < 2) return
    const ratio = renderPixelRatio(window.devicePixelRatio || 1, tier, 0)
    if (this.renderer.getPixelRatio() !== ratio) {
      this.renderer.setPixelRatio(ratio)
      this.renderer.setSize(width, height, false)
    }
    holdRendering(true)
    try {
      await this.post.precompile(tier)
    } finally {
      holdRendering(false)
    }
  }

  /** Scene-layer host. Recreates one layer after replaceSceneLayer. */
  remountLayer(id: string): void {
    if (this.disposed || !this.renderer) return
    this.mountLayer(id)
  }

  dispose(): void {
    this.disposed = true
    this.unsubscribeModels?.()
    this.unsubscribeModels = null
    this.unbindHost?.()
    this.unbindHost = null
    cancelAnimationFrame(this.raf)
    if (this.primary) {
      this.canvas.removeEventListener('pointerdown', this.onDown, true)
      this.canvas.removeEventListener('pointerup', this.onUp)
    }
    this.rig?.deactivate?.()
    this.controls?.dispose()
    // GPU teardown waits for a running precompile: freeing geometry or the renderer under
    // three's compileAsync makes it build pipelines against dead resources.
    const teardown = () => {
      for (const layer of this.layers.values()) layer.dispose()
      this.layers.clear()
      this.clearLevels()
      this.post?.dispose()
      this.post = null
      this.renderer?.dispose()
    }
    if (this.compileDone) void this.compileDone.then(teardown)
    else teardown()
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
    if (this.disposed) return
    if (!this.renderer) {
      this.queued = { project, state }
      return
    }
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
    if (project.id !== this.compiledProject) {
      // A template or file load brings a scene full of new render objects: compile them
      // before the next frame instead of inside it.
      this.compiledProject = project.id
      this.compileWanted = true
    }
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
      bucket.instancer.dispose()
      disposeTree(bucket.group)
      this.levels.delete(id)
    }
    let rebuildMs = 0
    let wallsTotal = 0
    let rebuiltAny = false
    let lowest = Infinity
    for (const level of project.levels) lowest = Math.min(lowest, level.elevation)
    for (const level of project.levels) {
      let bucket = this.levels.get(level.id)
      if (!bucket) {
        bucket = emptyBucket()
        this.levels.set(level.id, bucket)
        this.root.add(bucket.group)
      }
      const below = levelBelow(project, level)
      const above = levelAbove(project, level)
      const belowStairs = below?.stairs
      const ground = level.elevation <= lowest + 1e-6
      const others =
        bucket.rooms === level.rooms &&
        bucket.elevation === level.elevation &&
        bucket.ground === ground &&
        bucket.height === level.height &&
        bucket.slab === level.slabThickness &&
        bucket.belowStairs === belowStairs &&
        bucket.roofs === level.roofs &&
        bucket.trim === level.trim &&
        bucket.aboveWalls === above?.walls &&
        bucket.aboveSlab === above?.slabThickness
      const same = others && bucket.walls === level.walls && bucket.openings === level.openings
      if (!same) {
        const started = performance.now()
        const rooms = roomsFor(level)
        const ctx = {
          rooms,
          trim: resolveTrim(level.trim),
          above: above ? { rooms: roomsFor(above), slab: above.slabThickness } : undefined,
          ground,
        }
        const buildFor = (wall: Level['walls'][number]): THREE.Object3D[] => {
          const objects: THREE.Object3D[] = [buildWall(wall, level, level.walls, ctx)]
          if (wall.kind !== 'railing') {
            for (const opening of level.openings) {
              if (opening.wallId === wall.id) objects.push(buildOpening(opening, wall, level.elevation, { rooms }))
            }
          }
          return objects
        }
        const buildFloorObject = () =>
          buildFloors(level, rooms, {
            holes: (belowStairs ?? []).map((stair) => stairHoleOutline(stair)),
            upper: !!below,
            skipCeiling: level.roofs.length > 0,
          })
        let wallsRebuilt = 0
        if (others && bucket.floorObject) {
          const diff = diffWalls(bucket.walls, level.walls, bucket.openings, level.openings)
          for (const id of [...diff.remove, ...diff.rebuild]) {
            const objects = bucket.wallObjects.get(id)
            if (!objects) continue
            for (const object of objects) {
              bucket.structural.remove(object)
              disposeTree(object)
            }
            bucket.wallObjects.delete(id)
          }
          const byId = new Map(level.walls.map((wall) => [wall.id, wall]))
          for (const id of diff.rebuild) {
            const wall = byId.get(id)
            if (!wall) continue
            const objects = buildFor(wall)
            for (const object of objects) bucket.structural.add(object)
            bucket.wallObjects.set(id, objects)
            wallsRebuilt++
          }
          if (diff.floors) {
            bucket.structural.remove(bucket.floorObject)
            disposeTree(bucket.floorObject)
            bucket.floorObject = buildFloorObject()
            bucket.structural.add(bucket.floorObject)
          }
        } else {
          disposeTree(bucket.structural)
          bucket.structural.clear()
          bucket.wallObjects.clear()
          for (const wall of level.walls) {
            const objects = buildFor(wall)
            for (const object of objects) bucket.structural.add(object)
            bucket.wallObjects.set(wall.id, objects)
            wallsRebuilt++
          }
          bucket.floorObject = buildFloorObject()
          bucket.structural.add(bucket.floorObject)
        }
        rebuildMs += performance.now() - started
        wallsTotal += wallsRebuilt
        rebuiltAny = true
        bucket.walls = level.walls
        bucket.belowStairs = belowStairs
        bucket.roofs = level.roofs
        bucket.trim = level.trim
        bucket.aboveWalls = above?.walls
        bucket.aboveSlab = above?.slabThickness
        bucket.openings = level.openings
        bucket.rooms = level.rooms
        bucket.elevation = level.elevation
        bucket.ground = ground
        bucket.height = level.height
        bucket.slab = level.slabThickness
      }
      this.syncItems(bucket, level)
    }
    if (rebuiltAny) {
      this.lastRebuildMs = rebuildMs
      this.lastWallsRebuilt = wallsTotal
    }
  }

  private syncItems(bucket: Bucket, level: Level): void {
    const seen = new Set<string>()
    let changed = false
    for (const item of level.items) {
      seen.add(item.id)
      const prev = bucket.itemMap.get(item.id)
      // A procedural placeholder is rebuilt once its scanned model has loaded.
      const upgrade = !!prev && !prev.scanned && prev.source === item && this.modelsArrived && modelFor(item.catalogId) !== null
      if (prev?.source === item && !upgrade) continue
      changed = true
      if (prev) {
        bucket.items.remove(prev.object)
        disposeTree(prev.object)
        dropShadow(bucket, prev.shadow)
      }
      const object = buildItem(item)
      object.position.y = level.elevation + item.elevation
      bucket.items.add(object)
      const shadow = contactShadowFor(object, item)
      if (shadow) {
        shadow.position.x = object.position.x
        shadow.position.z = object.position.z
        shadow.rotation.y = object.rotation.y
        bucket.shadows.add(shadow)
      }
      bucket.itemMap.set(item.id, { source: item, object, scanned: typeof object.userData.scanned === 'string', shadow })
    }
    for (const [id, prev] of bucket.itemMap) {
      if (seen.has(id)) continue
      changed = true
      bucket.items.remove(prev.object)
      disposeTree(prev.object)
      dropShadow(bucket, prev.shadow)
      bucket.itemMap.delete(id)
    }
    if (changed) liftShadows(bucket, level)
    if (changed || bucket.instancer.dirty) {
      bucket.instancer.rebuild([...bucket.itemMap].map(([id, entry]) => ({ id, object: entry.object })))
      bucket.instancer.update(this.camera, true)
    }
  }

  /**
   * Swap loaded models in for their placeholders, once the batch in flight has landed (or
   * has taken too long), then compile the new pipelines with frames held instead of inside
   * a frame.
   */
  private swapModels(): void {
    if (this.modelsWaitingSince === null || !this.seenProject) return
    const waited = performance.now() - this.modelsWaitingSince
    if (modelsLoading() > 0 && waited < MODEL_SWAP_WAIT_MS) return
    this.modelsWaitingSince = null
    this.modelsArrived = true
    for (const level of this.seenProject.levels) {
      const bucket = this.levels.get(level.id)
      if (bucket) this.syncItems(bucket, level)
    }
    this.modelsArrived = false
    this.updateHelpers(this.signature?.selection ?? [])
    this.compileWanted = true
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
    if (width < 2 || height < 2 || this.benchmarking) return
    try {
      // While pipelines compile the frame is held whole: a resize would recreate the render
      // targets being compiled against, and layers (sky capture) must not render meanwhile.
      if (this.compiling) return
      if (this.pendingFrame && this.seenProject) this.frameOn(this.seenProject, this.signature)
      const settings = useSettings.getState()
      const tier = this.primary ? settings.graphicsQuality : 'low'
      const ratio = renderPixelRatio(window.devicePixelRatio || 1, tier, this.primary ? settings.renderScale : 0)
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
      this.swapModels()
      for (const bucket of this.levels.values()) bucket.instancer.update(this.camera)
      for (const layer of this.eachLayer()) layer.update?.(dt, this.elapsed)
      for (const child of this.helpers.children) {
        const helper = child as THREE.BoxHelper
        helper.update()
      }
      if (this.primary && this.post) {
        const chain = this.post.wantedKey(tier)
        if (chain !== this.compiledChain) {
          this.compiledChain = chain
          this.compileWanted = true
        }
        // Not before the first real frame: three's compileAsync then builds pipelines for render
        // targets that do not exist yet (invalid pipelines, "format undefined").
        if (this.compileWanted && !this.compiling && this.framesRendered > 0) this.precompile(tier)
        if (this.compiling) return
      }
      this.renderOnce()
      this.framesRendered += 1
      if (this.primary) recordFrame(this.renderer as unknown as PerfRenderer, this.scene, rawMs, this.backend ?? undefined)
      else this.renderer.info.reset()
    } catch (err) {
      this.failed = true
      console.error(err)
    }
  }

  /**
   * Compile the scene's pipelines for `tier` off the main thread, holding frames meanwhile.
   * A cap keeps a compile that never settles from freezing the view.
   */
  private precompile(tier: GraphicsQuality): void {
    const post = this.post
    if (!post) return
    this.compileWanted = false
    this.compiling = true
    holdRendering(true)
    const started = performance.now()
    const cap = new Promise<void>((resolve) => window.setTimeout(resolve, PRECOMPILE_CAP_MS))
    const compile = async () => {
      await post.precompile(tier)
      for (const layer of this.eachLayer()) {
        if (this.disposed) return
        try {
          await layer.precompile?.()
        } catch (err) {
          console.warn('[nestwright] layer precompile failed', err)
        }
      }
    }
    this.compileDone = Promise.race([compile(), cap]).finally(() => {
      this.compileDone = null
      this.compiling = false
      holdRendering(false)
      // Time spent holding frames would read as one giant frame.
      this.lastTime = performance.now()
      if (import.meta.env?.DEV) console.info(`[nestwright] precompile ${tier}: ${Math.round(performance.now() - started)} ms`)
    })
  }

  /** Draw one frame through this view's post chain at the renderer's current size. */
  renderOnce(): void {
    if (!this.renderer || !this.post) return
    this.post.render(useSettings.getState().graphicsQuality)
  }

  /**
   * Render a frame and copy it into a 2D canvas in the same task. A WebGPU (or non-preserved
   * WebGL) canvas only holds its pixels until the frame is presented, so this is the one
   * readback that works on both backends and sees exactly what the screen shows.
   */
  capture(): HTMLCanvasElement | null {
    if (!this.renderer || this.disposed) return null
    // A still waits for temporal AA to converge after a resize or camera cut.
    if (this.post) this.post.renderStill(useSettings.getState().graphicsQuality)
    return captureCanvas(this.canvas)
  }

  /** sRGB bytes at world points ([x,y,z]) or canvas CSS points ({x,y}); null when off screen. */
  async samplePixels(points: readonly SamplePoint[]): Promise<(PixelSample | null)[]> {
    if (!(await this.ready)) return points.map(() => null)
    const frame = this.capture()
    if (!frame) return points.map(() => null)
    return samplePoints(frame, this.canvas, this.camera, points)
  }

  /** Largest square texture the backend can render, for photo export. */
  maxTextureSize(): number {
    const backend = this.renderer?.backend as
      | { device?: { limits?: { maxTextureDimension2D?: number } }; gl?: WebGL2RenderingContext }
      | undefined
    const gpu = backend?.device?.limits?.maxTextureDimension2D
    if (typeof gpu === 'number' && gpu > 0) return gpu
    const gl = backend?.gl
    const size = gl ? Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) : 0
    return Number.isFinite(size) && size > 0 ? size : 4096
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
    for (const bucket of this.levels.values()) {
      bucket.instancer.dispose()
      disposeTree(bucket.group)
    }
    this.levels.clear()
  }
}

function dropShadow(bucket: Bucket, shadow: THREE.Mesh | null): void {
  if (!shadow) return
  bucket.shadows.remove(shadow)
  releaseContactShadow(shadow)
}

/**
 * Sit each contact shadow on what its item stands on: the floor, or a rug when the item's
 * centre is over one (a rug is drawn above the floor and would hide the decal).
 */
function liftShadows(bucket: Bucket, level: Level): void {
  const rugs = level.items.filter((item) => isFlatItem(item) && Math.abs(item.elevation) <= 0.05)
  const outlines = rugs.map((rug) => ({ top: rug.elevation + rug.size.h, outline: itemFootprint(rug) }))
  for (const entry of bucket.itemMap.values()) {
    if (!entry.shadow) continue
    let base = 0
    for (const rug of outlines) {
      if (rug.top > base && pointInPolygon(entry.source.position, rug.outline)) base = rug.top
    }
    entry.shadow.position.y = level.elevation + base + CONTACT.lift
  }
}

function emptyBucket(): Bucket {
  const group = new THREE.Group()
  const structural = new THREE.Group()
  const items = new THREE.Group()
  const shadows = new THREE.Group()
  shadows.name = 'contact-shadows'
  group.add(structural)
  group.add(shadows)
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
    trim: undefined,
    aboveWalls: undefined,
    aboveSlab: undefined,
    ground: false,
    elevation: Number.NaN,
    height: Number.NaN,
    slab: Number.NaN,
    wallObjects: new Map(),
    floorObject: null,
    shadows,
    itemMap: new Map(),
    instancer: new ModelInstancer(items),
  }
}

/** The storey whose floor is this level's ceiling (its elevation is this level's top). */
function levelAbove(project: Project, level: Level): Level | null {
  const top = level.elevation + level.height
  return project.levels.find((other) => other.id !== level.id && Math.abs(other.elevation - top) < 0.05) ?? null
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
    // Contact-shadow decals share a cached texture; hand them back instead of disposing.
    if (mesh.userData?.contactShadow) {
      releaseContactShadow(mesh)
      return
    }
    // Scanned models share geometry between items; a sliced copy is freed with its last user.
    if (isSharedGeometry(mesh.geometry)) releaseModelGeometry(mesh.geometry)
    else mesh.geometry?.dispose()
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
