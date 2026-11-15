import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { contentUrl } from '../../materials/contentUrl'
import { contentIndex, getLoader, type ContentCredit, type ContentModel } from '../../materials/pbrTextures'
import { setPerfExtra, setSettleBusy } from '../../view3d/perfMonitor'
import { flattenScene, gameMaterial, partsBounds, shareLod0Materials, type ModelTemplate } from './template'

/**
 * Scanned furniture from the content pack. The catalog's procedural builds stay the
 * placeholder and the fallback: `modelFor` answers synchronously, null until the model has
 * loaded (and for good when there is no pack), and listeners hear when one arrives.
 */

let models: Record<string, ContentModel> | null = null
let credits: ContentCredit[] = []
let indexAsked = false
let indexDone = false
const templates = new Map<string, ModelTemplate>()
const loading = new Set<string>()
const failed = new Set<string>()
const wanted = new Set<string>()
const listeners = new Set<() => void>()
let gltf: GLTFLoader | null = null
let loadMs = 0
let loaded = 0

/** `?models=off` (or localStorage `nestwright:models` = `off`) keeps the procedural furniture. */
function disabled(): boolean {
  try {
    const search = globalThis.location?.search ?? ''
    if (new URLSearchParams(search).get('models') === 'off') return true
    return globalThis.localStorage?.getItem('nestwright:models') === 'off'
  } catch {
    return false
  }
}

function emit(): void {
  for (const listener of [...listeners]) listener()
}

export function subscribeModels(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function askIndex(): void {
  if (indexAsked) return
  indexAsked = true
  if (disabled()) {
    indexDone = true
    return
  }
  void contentIndex().then((index) => {
    models = index?.models ?? {}
    credits = index?.credits ?? []
    indexDone = true
    const count = Object.keys(models).length
    if (count) console.info(`[nestwright] content pack: ${count} furniture models`)
    for (const id of wanted) startLoad(id)
    wanted.clear()
    emit()
  })
}

function loader(): GLTFLoader {
  if (gltf) return gltf
  gltf = new GLTFLoader()
  gltf.setKTX2Loader(getLoader())
  gltf.setMeshoptDecoder(MeshoptDecoder)
  return gltf
}

function prepareTextures(material: THREE.MeshStandardMaterial): void {
  for (const map of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap, material.aoMap, material.emissiveMap]) {
    if (map) map.anisotropy = 4
  }
}

async function loadTemplate(catalogId: string, info: ContentModel): Promise<ModelTemplate> {
  const gl = loader()
  const [near, far] = await Promise.all([
    gl.loadAsync(contentUrl(info.lod0)),
    info.lod1 ? gl.loadAsync(contentUrl(info.lod1)) : Promise.resolve(null),
  ])
  const cache = new Map<THREE.Material, ReturnType<typeof gameMaterial>>()
  const materialFor = (source: THREE.Material) => {
    let hit = cache.get(source)
    if (!hit) {
      hit = gameMaterial(source, info.key)
      prepareTextures(hit.material)
      cache.set(source, hit)
    }
    return hit
  }
  const lod0 = flattenScene(near.scene, info.key, materialFor)
  if (lod0.length === 0) throw new Error('model has no meshes')
  const lod1 = far ? shareLod0Materials(flattenScene(far.scene, info.key, materialFor), lod0) : null
  const { bounds, radius } = partsBounds(lod0)
  return { key: info.key, catalogId, bounds, radius, lod0, lod1: lod1 && lod1.length ? lod1 : null }
}

function startLoad(catalogId: string): void {
  if (!models || templates.has(catalogId) || loading.has(catalogId) || failed.has(catalogId)) return
  const info = models[catalogId]
  if (!info) return
  loading.add(catalogId)
  const started = performance.now()
  loadTemplate(catalogId, info)
    .then((template) => {
      templates.set(catalogId, template)
      loaded += 1
      loadMs += performance.now() - started
    })
    .catch((err: unknown) => {
      failed.add(catalogId)
      console.info(`[nestwright] model ${info.key} failed to load; procedural furniture (${err instanceof Error ? err.message : String(err)})`)
    })
    .finally(() => {
      loading.delete(catalogId)
      emit()
    })
}

/** The loaded model for a catalog id, or null (asks for it, so a later call may have it). */
export function modelFor(catalogId: string): ModelTemplate | null {
  const hit = templates.get(catalogId)
  if (hit) return hit
  askIndex()
  if (!indexDone) wanted.add(catalogId)
  else startLoad(catalogId)
  return null
}

/** Whether the installed pack has a model for this catalog id (false until the index is read). */
export function hasModel(catalogId: string): boolean {
  askIndex()
  return !!models?.[catalogId] && !failed.has(catalogId)
}

let creditsPending: Promise<readonly ContentCredit[]> | null = null

/**
 * Third-party assets in the installed pack; empty with no pack. Reads the index itself, so
 * the Credits screen works before any 3D view has started the renderer.
 */
export function loadContentCredits(): Promise<readonly ContentCredit[]> {
  if (indexDone && models) return Promise.resolve(credits)
  creditsPending ??= fetch(contentUrl('index.json'))
    .then(async (res) => {
      const text = res.ok ? await res.text() : ''
      const parsed = text.trimStart().startsWith('{') ? (JSON.parse(text) as { credits?: unknown }) : null
      return Array.isArray(parsed?.credits) ? (parsed.credits as ContentCredit[]) : []
    })
    .catch(() => [] as ContentCredit[])
  return creditsPending
}

/** Models still downloading or decoding. */
export function modelsLoading(): number {
  return loading.size + (indexAsked && !indexDone && wanted.size > 0 ? 1 : 0)
}

setSettleBusy('models', () => modelsLoading() > 0)
setPerfExtra('models', () => ({ loaded, loading: loading.size, failed: failed.size, avgLoadMs: loaded ? Math.round(loadMs / loaded) : 0 }))
