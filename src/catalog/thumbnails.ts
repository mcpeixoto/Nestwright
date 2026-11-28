import * as THREE from 'three'
import { getMaterial, isCachedMaterial } from '../materials/materialCache'
import { getOffscreenRenderer } from '../view3d/render/offscreen'
import { buildModel, isSharedGeometry, modelFor, releaseModelGeometry } from './models'
import { occupy } from './parts'
import { getEntry } from './registry'

const thumbs = new Map<string, string>()
const listeners = new Set<() => void>()
let revision = 0
const queue: string[] = []
let pumping = false

export function subscribeThumbs(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getThumb(id: string): string {
  return thumbs.get(id) ?? ''
}

export function thumbRevision(): number {
  return revision
}

function notify() {
  revision += 1
  for (const listener of listeners) listener()
}

/** One scene, rig and set of lights for every thumbnail; only the item changes. */
interface Stage {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
}

let stage: Stage | null = null

function getStage(): Stage {
  if (stage) return stage
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#e4e0d8')
  scene.add(new THREE.HemisphereLight('#fffaf2', '#c9c3b8', 0.9))
  const key = new THREE.DirectionalLight('#ffffff', 1.5)
  key.position.set(2.4, 4.2, 3.2)
  scene.add(key)
  const fill = new THREE.DirectionalLight('#d5deea', 0.55)
  fill.position.set(-3, 2, -2)
  scene.add(fill)
  stage = { scene, camera: new THREE.PerspectiveCamera(32, 1, 0.02, 40) }
  return stage
}

/**
 * Free what one thumbnail build allocated: every geometry, and the materials and textures the
 * builder marked `userData.owned` (the same rule the live scene uses). Library materials and
 * builder-level shared ones stay: the live scene uses them too.
 */
export function disposeThumbObject(root: THREE.Object3D): void {
  const materials = new Set<THREE.Material>()
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    // Scanned-model geometry belongs to the template (or a ref-counted slice): release, never dispose.
    if (isSharedGeometry(mesh.geometry)) releaseModelGeometry(mesh.geometry)
    else mesh.geometry?.dispose()
    const listed = mesh.material
    for (const material of Array.isArray(listed) ? listed : listed ? [listed] : []) {
      if (material.userData?.owned && !isCachedMaterial(material)) materials.add(material)
    }
  })
  for (const material of materials) {
    const map = (material as THREE.MeshStandardMaterial).map
    if (map?.userData?.owned) map.dispose()
    material.dispose()
  }
}

function renderOne(id: string, gl: THREE.WebGPURenderer | null) {
  if (thumbs.has(id)) return
  const entry = getEntry(id)
  if (!entry || !gl) {
    thumbs.set(id, '')
    return
  }
  const { scene, camera } = getStage()
  let built: THREE.Object3D | null = null
  try {
    const materials: Record<string, THREE.MeshStandardMaterial> = {}
    for (const [slot, ref] of Object.entries(entry.materialSlots)) materials[slot] = getMaterial(ref)
    const template = modelFor(id)
    if (template) {
      // Scanned model from the content pack: the thumbnail shows what gets placed.
      built = new THREE.Group()
      built.add(buildModel(template, entry.defaultSize, !!entry.light))
      occupy(built, entry.defaultSize)
    } else {
      built = entry.build({ size: entry.defaultSize, materials, params: {} })
    }
    scene.add(built)
    const box = new THREE.Box3().setFromObject(built)
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    if (!Number.isFinite(sphere.radius) || sphere.radius < 1e-3) {
      sphere.center.set(0, entry.defaultSize.h * 0.4, 0)
      sphere.radius = Math.max(entry.defaultSize.w, entry.defaultSize.d, entry.defaultSize.h, 0.4) * 0.6
    }
    const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(16))
    camera.position.copy(sphere.center).add(new THREE.Vector3(0.72, 0.48, 0.9).normalize().multiplyScalar(dist))
    camera.lookAt(sphere.center)
    // Same task as the render: a WebGPU canvas drops its pixels once the frame is presented.
    gl.render(scene, camera)
    thumbs.set(id, gl.domElement.toDataURL('image/png'))
  } catch {
    thumbs.set(id, '')
  } finally {
    if (built) {
      scene.remove(built)
      disposeThumbObject(built)
    }
  }
}

async function pump() {
  const gl = await getOffscreenRenderer()
  let budget = 4
  while (budget > 0 && queue.length > 0) {
    const id = queue.shift()
    if (!id) break
    renderOne(id, gl)
    budget -= 1
  }
  notify()
  if (queue.length === 0) {
    pumping = false
    return
  }
  schedule(16)
}

function schedule(ms: number) {
  const run = () => void pump()
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
  else setTimeout(run, ms)
}

/** Queue a 128px thumbnail. Safe when WebGL is missing: the library still places the item. */
export function forgetThumb(id: string): void {
  thumbs.delete(id)
}

export function requestThumb(id: string, urgent = false): void {
  if (!id || thumbs.has(id)) return
  const existing = queue.indexOf(id)
  if (existing >= 0) {
    if (urgent && existing > 0) {
      queue.splice(existing, 1)
      queue.unshift(id)
    }
    return
  }
  if (urgent) queue.unshift(id)
  else queue.push(id)
  if (!pumping) {
    pumping = true
    schedule(0)
  }
}
