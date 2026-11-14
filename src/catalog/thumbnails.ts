import * as THREE from 'three'
import { getMaterial } from '../materials/materialCache'
import { getEntry } from './registry'

const thumbs = new Map<string, string>()
const listeners = new Set<() => void>()
let revision = 0
let renderer: THREE.WebGPURenderer | null = null
let starting: Promise<THREE.WebGPURenderer | null> | null = null
let failed = false
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

/** Its own small renderer; init is async, so the first pump waits for it. */
function ensureRenderer(): Promise<THREE.WebGPURenderer | null> {
  if (failed) return Promise.resolve(null)
  if (renderer) return Promise.resolve(renderer)
  if (starting) return starting
  if (typeof document === 'undefined') {
    failed = true
    return Promise.resolve(null)
  }
  starting = (async () => {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 128
      canvas.height = 128
      const created = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: true })
      await created.init()
      created.setSize(128, 128, false)
      created.outputColorSpace = THREE.SRGBColorSpace
      created.toneMapping = THREE.ACESFilmicToneMapping
      created.toneMappingExposure = 1.05
      renderer = created
      return created
    } catch {
      failed = true
      return null
    }
  })()
  return starting
}

function renderOne(id: string, gl: THREE.WebGPURenderer | null) {
  if (thumbs.has(id)) return
  const entry = getEntry(id)
  if (!entry || !gl) {
    thumbs.set(id, '')
    return
  }
  try {
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#e4e0d8')
    const materials: Record<string, THREE.MeshStandardMaterial> = {}
    for (const [slot, ref] of Object.entries(entry.materialSlots)) materials[slot] = getMaterial(ref)
    const built = entry.build({ size: entry.defaultSize, materials, params: {} })
    scene.add(built)
    scene.add(new THREE.HemisphereLight('#fffaf2', '#c9c3b8', 0.9))
    const key = new THREE.DirectionalLight('#ffffff', 1.5)
    key.position.set(2.4, 4.2, 3.2)
    scene.add(key)
    const fill = new THREE.DirectionalLight('#d5deea', 0.55)
    fill.position.set(-3, 2, -2)
    scene.add(fill)
    const box = new THREE.Box3().setFromObject(built)
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    if (!Number.isFinite(sphere.radius) || sphere.radius < 1e-3) {
      sphere.center.set(0, entry.defaultSize.h * 0.4, 0)
      sphere.radius = Math.max(entry.defaultSize.w, entry.defaultSize.d, entry.defaultSize.h, 0.4) * 0.6
    }
    const camera = new THREE.PerspectiveCamera(32, 1, 0.02, 40)
    const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(16))
    camera.position.copy(sphere.center).add(new THREE.Vector3(0.72, 0.48, 0.9).normalize().multiplyScalar(dist))
    camera.lookAt(sphere.center)
    // Same task as the render: a WebGPU canvas drops its pixels once the frame is presented.
    gl.render(scene, camera)
    thumbs.set(id, gl.domElement.toDataURL('image/png'))
    built.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      mesh.geometry?.dispose()
    })
  } catch {
    thumbs.set(id, '')
  }
}

async function pump() {
  const gl = await ensureRenderer()
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
