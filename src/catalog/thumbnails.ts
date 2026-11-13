import * as THREE from 'three'
import { getMaterial } from '../materials/materialCache'
import { getEntry } from './registry'

const thumbs = new Map<string, string>()
const listeners = new Set<() => void>()
let revision = 0
let renderer: THREE.WebGLRenderer | null = null
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

function ensureRenderer(): THREE.WebGLRenderer | null {
  if (failed || renderer) return renderer
  if (typeof document === 'undefined') {
    failed = true
    return null
  }
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setSize(128, 128, false)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    return renderer
  } catch {
    failed = true
    return null
  }
}

function renderOne(id: string) {
  if (thumbs.has(id)) return
  const entry = getEntry(id)
  const gl = ensureRenderer()
  if (!entry || !gl) {
    thumbs.set(id, '')
    return
  }
  try {
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#1c2228')
    const materials: Record<string, THREE.MeshStandardMaterial> = {}
    for (const [slot, ref] of Object.entries(entry.materialSlots)) materials[slot] = getMaterial(ref)
    const built = entry.build({ size: entry.defaultSize, materials, params: {} })
    scene.add(built)
    scene.add(new THREE.AmbientLight('#ffffff', 0.7))
    const key = new THREE.DirectionalLight('#fff4e5', 1.4)
    key.position.set(2, 4, 3)
    scene.add(key)
    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 20)
    const { w, d, h } = entry.defaultSize
    const radius = Math.max(w, d, h)
    camera.position.set(radius * 1.15, radius * 0.9, radius * 1.25)
    camera.lookAt(0, h * 0.4, 0)
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

function pump() {
  const id = queue.shift()
  if (!id) {
    pumping = false
    return
  }
  renderOne(id)
  notify()
  if (queue.length === 0) {
    pumping = false
    return
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(pump)
  else setTimeout(pump, 16)
}

/** Queue a 128px thumbnail. Safe when WebGL is missing: the library still places the item. */
export function forgetThumb(id: string): void {
  thumbs.delete(id)
}

export function requestThumb(id: string): void {
  if (thumbs.has(id) || queue.includes(id)) return
  queue.push(id)
  if (!pumping) {
    pumping = true
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(pump)
    else setTimeout(pump, 0)
  }
}
