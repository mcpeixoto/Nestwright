import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { getOffscreenRenderer } from '../view3d/render/offscreen'

/** Frames of the turntable preview; the dialog cycles through them. */
export const TURNTABLE_FRAMES = 24

function decode(data: string): ArrayBuffer {
  const binary = atob(data)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 255
  return buffer
}

/** The preview owns everything the loader made: geometry, materials and their textures. */
function disposeModel(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    mesh.geometry?.dispose()
    const listed = mesh.material
    for (const material of Array.isArray(listed) ? listed : listed ? [listed] : []) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose()
      }
      material.dispose()
    }
  })
}

function parse(data: string): Promise<THREE.Object3D> {
  return new Promise((resolve, reject) => {
    try {
      new GLTFLoader().parse(decode(data), '', (gltf) => resolve(gltf.scene), reject)
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

/**
 * Turntable frames (PNG data URLs) of a base64 GLB at the size the player typed, rendered on the
 * shared thumbnail renderer with the same light rig as the Library thumbnails. Empty when
 * there is no GPU; throws when the GLB does not parse.
 */
export async function renderTurntable(
  data: string,
  size: { w: number; d: number; h: number },
  frames = TURNTABLE_FRAMES,
): Promise<string[]> {
  const model = await parse(data)
  const gl = await getOffscreenRenderer()
  if (!gl) {
    disposeModel(model)
    return []
  }
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#e4e0d8')
  scene.add(new THREE.HemisphereLight('#fffaf2', '#c9c3b8', 0.9))
  const key = new THREE.DirectionalLight('#ffffff', 1.5)
  key.position.set(2.4, 4.2, 3.2)
  scene.add(key)
  const fill = new THREE.DirectionalLight('#d5deea', 0.55)
  fill.position.set(-3, 2, -2)
  scene.add(fill)
  const camera = new THREE.PerspectiveCamera(32, 1, 0.02, 60)

  const pivot = new THREE.Group()
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  const measured = new THREE.Vector3()
  box.getSize(measured)
  model.scale.set(
    size.w / Math.max(measured.x, 1e-4),
    size.h / Math.max(measured.y, 1e-4),
    size.d / Math.max(measured.z, 1e-4),
  )
  model.updateMatrixWorld(true)
  const fitted = new THREE.Box3().setFromObject(model)
  const center = new THREE.Vector3()
  fitted.getCenter(center)
  model.position.set(-center.x, -fitted.min.y, -center.z)
  pivot.add(model)
  scene.add(pivot)

  const sphere = new THREE.Box3().setFromObject(pivot).getBoundingSphere(new THREE.Sphere())
  const radius = Number.isFinite(sphere.radius) && sphere.radius > 1e-3 ? sphere.radius : 0.6
  const dist = radius / Math.sin(THREE.MathUtils.degToRad(16))
  camera.position.copy(sphere.center).add(new THREE.Vector3(0, 0.48, 1.15).normalize().multiplyScalar(dist))
  camera.lookAt(sphere.center)

  const out: string[] = []
  try {
    for (let i = 0; i < frames; i++) {
      pivot.rotation.y = (i / frames) * Math.PI * 2
      pivot.updateMatrixWorld(true)
      gl.render(scene, camera)
      out.push(gl.domElement.toDataURL('image/png'))
    }
  } finally {
    disposeModel(model)
  }
  return out
}
