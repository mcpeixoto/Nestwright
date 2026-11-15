import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type * as THREE from 'three'
import type { Project } from '../model/types'
import type { LevelDisplay, ViewMode } from '../store'

export interface SceneViewState {
  activeLevelId: string
  selection: readonly string[]
  levelDisplay: LevelDisplay
  view: ViewMode
  tool: string
}

export interface SceneLayerController {
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly renderer: THREE.WebGPURenderer | null
  readonly controls: OrbitControls | null
  frame(): void
}

export interface SceneLayerContext {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGPURenderer | null
  controller: SceneLayerController
}

export interface SceneLayer {
  sync(project: Project, state: SceneViewState): void
  update?(dt: number, elapsed: number): void
  /** Compile the layer's own off-screen pipelines while the view holds frames (project load, tier change). */
  precompile?(): Promise<void>
  dispose(): void
}

export interface SceneLayerDef {
  id: string
  create(ctx: SceneLayerContext): SceneLayer
}

export interface SceneLayerHost {
  remountLayer(id: string): void
}

const defs = new Map<string, SceneLayerDef>()
const order: string[] = []
const hosts = new Set<SceneLayerHost>()

function notify(id: string): void {
  for (const host of hosts) host.remountLayer(id)
}

export function registerSceneLayer(def: SceneLayerDef): void {
  if (!order.includes(def.id)) order.push(def.id)
  defs.set(def.id, def)
  notify(def.id)
}

/** Swap a live layer. Later waves replace `ground` or `atmosphere` this way. */
export function replaceSceneLayer(id: string, def: SceneLayerDef): void {
  registerSceneLayer({ ...def, id })
}

export function listSceneLayers(): SceneLayerDef[] {
  const out: SceneLayerDef[] = []
  for (const id of order) {
    const def = defs.get(id)
    if (def) out.push(def)
  }
  return out
}

export function bindSceneHost(host: SceneLayerHost): () => void {
  hosts.add(host)
  return () => {
    hosts.delete(host)
  }
}
