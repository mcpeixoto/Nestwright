import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { forgetThumb, requestThumb } from '../catalog/thumbnails'
import type { CatalogEntry } from '../catalog/types'
import { getEntry, listEntries, registerEntries, unregisterEntry } from '../catalog/registry'
import { newId } from '../model/ids'
import type { ImportedAsset } from '../model/types'
import { getPlatform } from '../platform'
import { useStore } from '../store'

const cache = new Map<string, THREE.Group>()
const pending = new Set<string>()
const failed = new Set<string>()
let booted = false

export function catalogIdForAsset(assetId: string): string {
  return `import:${assetId}`
}

function decode(data: string): Uint8Array {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 255
  return bytes
}

function clampMeasured(x: number, y: number, z: number): { w: number; d: number; h: number } {
  let w = Math.max(x, 0.05)
  let d = Math.max(z, 0.05)
  let h = Math.max(y, 0.05)
  const max = Math.max(w, d, h)
  if (max > 6) {
    const scale = 6 / max
    w *= scale
    d *= scale
    h *= scale
  }
  return { w, d, h }
}

function cloneModel(source: THREE.Object3D): THREE.Group {
  const clone = source.clone(true) as THREE.Group
  clone.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    mesh.geometry = mesh.geometry.clone()
    mesh.userData.slot = 'body'
    mesh.castShadow = true
    mesh.receiveShadow = true
  })
  return clone
}

function fit(clone: THREE.Object3D, size: { w: number; d: number; h: number }): void {
  clone.position.set(0, 0, 0)
  clone.scale.set(1, 1, 1)
  clone.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(clone)
  const measured = new THREE.Vector3()
  box.getSize(measured)
  const uniform = Math.min(
    size.w / Math.max(measured.x, 1e-4),
    size.h / Math.max(measured.y, 1e-4),
    size.d / Math.max(measured.z, 1e-4),
  )
  clone.scale.setScalar(Number.isFinite(uniform) ? uniform : 1)
  clone.updateMatrixWorld(true)
  const fitted = new THREE.Box3().setFromObject(clone)
  const center = new THREE.Vector3()
  fitted.getCenter(center)
  clone.position.set(-center.x, -fitted.min.y, -center.z)
}

function finish(assetId: string, source: THREE.Object3D): void {
  pending.delete(assetId)
  const holder = new THREE.Group()
  source.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(source)
  if (box.isEmpty()) return
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)
  source.position.set(-center.x, -box.min.y, -center.z)
  holder.add(source)
  cache.set(assetId, holder)
  const measured = clampMeasured(size.x, size.y, size.z)
  const entry = getEntry(catalogIdForAsset(assetId))
  if (entry) entry.defaultSize = measured
  const catalogId = catalogIdForAsset(assetId)
  const used = useStore.getState().project.levels.some((level) => level.items.some((item) => item.catalogId === catalogId))
  if (!used) return
  useStore.getState().apply('Model ready', (draft) => {
    for (const level of draft.levels) {
      for (const item of level.items) {
        if (item.catalogId !== catalogId) continue
        if (item.params.ready === undefined) item.size = { ...measured }
        const ready = typeof item.params.ready === 'number' ? item.params.ready : 0
        item.params.ready = ready + 1
      }
    }
  })
  requestThumb(catalogId)
}

function parseAsset(asset: ImportedAsset): void {
  if (cache.has(asset.id) || pending.has(asset.id) || failed.has(asset.id)) return
  pending.add(asset.id)
  let bytes: Uint8Array
  try {
    bytes = decode(asset.data)
  } catch {
    pending.delete(asset.id)
    failed.add(asset.id)
    return
  }
  const head = new TextDecoder().decode(bytes.slice(0, 24)).trimStart()
  const obj = asset.format === 'obj' || head.startsWith('v ') || head.startsWith('o ') || head.startsWith('#') || head.startsWith('mtllib')
  const json = head.startsWith('{')
  const fail = () => {
    pending.delete(asset.id)
    failed.add(asset.id)
  }
  try {
    if (obj) {
      finish(asset.id, new OBJLoader().parse(new TextDecoder().decode(bytes)))
      return
    }
    const loader = new GLTFLoader()
    const copy = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(copy).set(bytes)
    const data = json ? new TextDecoder().decode(bytes) : copy
    loader.parse(data, '', (gltf) => finish(asset.id, gltf.scene), fail)
  } catch {
    fail()
  }
}

function registerImportedAsset(asset: ImportedAsset): void {
  const id = catalogIdForAsset(asset.id)
  if (!getEntry(id)) {
    const entry: CatalogEntry = {
      id,
      name: asset.name || 'Imported model',
      category: 'imported',
      tags: ['imported'],
      defaultSize: { w: 1, d: 1, h: 1 },
      price: 120,
      materialSlots: { body: { id: 'plaster-white' } },
      build(ctx) {
        const g = new THREE.Group()
        const cached = cache.get(asset.id)
        if (!cached) {
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(ctx.size.w, 0.05), Math.max(ctx.size.h, 0.05), Math.max(ctx.size.d, 0.05)), ctx.materials.body ?? new THREE.MeshStandardMaterial({ color: '#d9d3c7' }))
          mesh.position.y = ctx.size.h / 2
          mesh.userData.slot = 'body'
          mesh.castShadow = true
          mesh.receiveShadow = true
          g.add(mesh)
          parseAsset(asset)
          return g
        }
        const clone = cloneModel(cached)
        fit(clone, ctx.size)
        g.add(clone)
        return g
      },
    }
    registerEntries([entry])
  }
  parseAsset(asset)
}

function syncAssets(): void {
  const assets = useStore.getState().project.assets ?? []
  const live = new Set(assets.map((asset) => asset.id))
  for (const asset of assets) registerImportedAsset(asset)
  for (const entry of listEntries('imported')) {
    const assetId = entry.id.slice('import:'.length)
    if (live.has(assetId)) continue
    unregisterEntry(entry.id)
    cache.delete(assetId)
    pending.delete(assetId)
    failed.delete(assetId)
    forgetThumb(entry.id)
  }
}

export function bootImportedModels(): void {
  if (booted) return
  booted = true
  syncAssets()
  useStore.subscribe((state, prev) => {
    if (state.project === prev.project) return
    syncAssets()
  })
}

export async function importModelFile(): Promise<void> {
  const file = await getPlatform().openFile('.glb,.gltf,.obj,model/gltf-binary,model/gltf+json')
  if (!file?.data) return
  const lower = file.name.toLowerCase()
  const asset: ImportedAsset = {
    id: newId('asset'),
    name: file.name.replace(/\.[^.]+$/, '') || 'Imported model',
    format: lower.endsWith('.obj') ? 'obj' : 'glb',
    data: file.data,
  }
  useStore.getState().apply('Import model', (draft) => {
    draft.assets.push(asset)
  })
  registerImportedAsset(asset)
}

export function removeImportedModel(assetId: string): void {
  const asset = useStore.getState().project.assets.find((entry) => entry.id === assetId)
  const label = asset?.name ?? 'this model'
  const message = `Remove ${label}? Placed copies of it will be removed too.`
  const run = () => {
    useStore.getState().apply('Remove model', (draft) => {
      draft.assets = draft.assets.filter((entry) => entry.id !== assetId)
      const catalogId = catalogIdForAsset(assetId)
      for (const level of draft.levels) {
        level.items = level.items.filter((item) => item.catalogId !== catalogId)
      }
    })
  }
  if (typeof document === 'undefined') {
    run()
    return
  }
  void import('../ui/confirm').then(({ confirmIfNeeded }) => confirmIfNeeded(message, run))
}
