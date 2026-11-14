import * as THREE from 'three'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { normalMap, texture } from 'three/tsl'
import { srgbByteToLinear } from '../view3d/colorLinear'
import { contentUrl, transcoderPath } from './contentUrl'

/** One texture set as `public/content/index.json` lists it (written by scripts/content). */
export interface ContentTexture {
  key: string
  tileMeters: number
  meanAlbedoSrgb: [number, number, number]
  /** Mean AO, roughness, metalness of the ORM map, 0–1. */
  meanOrm?: [number, number, number]
  maps: { albedo: string; normal?: string; orm?: string }
}

export interface ContentIndex {
  version: number
  textures: Record<string, ContentTexture>
}

export interface PbrMaps {
  info: ContentTexture
  albedo: THREE.Texture
  normal: THREE.Texture | null
  orm: THREE.Texture | null
  /**
   * The pipeline encodes normals with toktx `--normal_mode` (UASTC, X in RGB, Y in alpha), which
   * `material.normalMap` would read as XYZ. This node samples G/A and rebuilds Z instead.
   */
  normalNode: THREE.Node | null
}

/** Tangent-space normal from a two-channel (X in G, Y in A) KTX2 normal map. */
export function packedNormalNode(normal: THREE.Texture | null): THREE.Node | null {
  if (!normal) return null
  const node = normalMap(texture(normal))
  node.unpackNormalMode = THREE.NormalGAPacking
  return node as unknown as THREE.Node
}

/** Below this mean the ORM blue channel is the pipeline's black fill, not a metalness scan. */
const NO_METAL_MAP = 0.02
/** Above this mean the ORM red channel is the white fill: no AO scan. */
const NO_AO_MAP = 0.98
const ANISOTROPY = 8

/**
 * Scalars that make `scalar × mean(map)` equal the library value, so a scan keeps its
 * variation but its average roughness and metalness stay what the material says. A map that
 * is a constant fill (no scan) is dropped and the scalar is used as it is.
 */
export function pbrScalars(
  roughness: number,
  metalness: number,
  meanOrm: readonly [number, number, number] | undefined,
): { roughness: number; metalness: number; roughnessMap: boolean; metalnessMap: boolean; aoMap: boolean } {
  const g = meanOrm?.[1] ?? 0.5
  const b = meanOrm?.[2] ?? 0
  const r = meanOrm?.[0] ?? 1
  const roughnessMap = g > 0.02
  const metalnessMap = b > NO_METAL_MAP && metalness > 0
  return {
    roughness: roughnessMap ? roughness / g : roughness,
    metalness: metalnessMap ? metalness / b : metalness,
    roughnessMap,
    metalnessMap,
    aoMap: r < NO_AO_MAP,
  }
}

/** Brightness the tint may apply (×), and how far it may bend each channel's share. */
const GAIN_MIN = 1 / 3
const GAIN_MAX = 3
const HUE_MIN = 0.7
const HUE_MAX = 1.4
/** Beyond these the scan is a different material from the swatch: keep the procedural art. */
const REJECT_GAIN = [0.2, 5] as const
const REJECT_HUE = [0.4, 2.5] as const

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Colour multiplier that pulls the scan's mean albedo toward the library colour, or null when
 * the two disagree too much for a tint to fix.
 *
 * The swatch the plan and picker show is `def.color`, so the 3D surface should average near
 * it. Many scans are photographed darker than the real surface (Poly Haven's white plaster
 * averages sRGB 141), so brightness is matched (clamped to ×⅓–×3) and each channel's share
 * is bent by at most ±40%, which keeps the scan's own hue variation. A scan that needs more
 * than ×5 brightness or a 2.5× hue shift (a red velvet behind "Green velvet") is refused.
 */
export function albedoTint(defColor: string, meanAlbedoSrgb: readonly [number, number, number]): THREE.Color | null {
  const want = new THREE.Color(defColor)
  const have = meanAlbedoSrgb.map(srgbByteToLinear) as [number, number, number]
  const lumWant = luminance(want.r, want.g, want.b)
  const lumHave = luminance(have[0], have[1], have[2])
  if (lumHave <= 1e-4 || lumWant <= 1e-4) return null
  const gain = lumWant / lumHave
  if (gain < REJECT_GAIN[0] || gain > REJECT_GAIN[1]) return null
  const wantShare = [want.r / lumWant, want.g / lumWant, want.b / lumWant]
  const shares: number[] = []
  for (let i = 0; i < 3; i++) {
    const haveShare = Math.max(have[i]!, 1e-3) / lumHave
    const hue = wantShare[i]! / haveShare
    if (hue < REJECT_HUE[0] || hue > REJECT_HUE[1]) return null
    shares.push(Math.min(HUE_MAX, Math.max(HUE_MIN, hue)))
  }
  const g = Math.min(GAIN_MAX, Math.max(GAIN_MIN, gain))
  return new THREE.Color().setRGB(g * shares[0]!, g * shares[1]!, g * shares[2]!, THREE.LinearSRGBColorSpace)
}

let renderer: THREE.WebGPURenderer | null = null
let loader: KTX2Loader | null = null
let indexPending: Promise<ContentIndex | null> | null = null
let noted = false
const ready: Array<() => void> = []
const sets = new Map<string, Promise<PbrMaps | null>>()
const scaled = new Map<string, PbrMaps>()

function note(message: string): void {
  if (noted) return
  noted = true
  console.info(`[nestwright] ${message}`)
}

/**
 * Hand the first initialised renderer to the loader. KTX2 needs it to pick a GPU format;
 * until then every request waits, so tests and the 2D-only paths never fetch anything.
 */
export function setPbrRenderer(next: THREE.WebGPURenderer): void {
  if (renderer) return
  renderer = next
  for (const resume of ready.splice(0)) resume()
}

function whenRenderer(): Promise<void> {
  if (renderer) return Promise.resolve()
  return new Promise((resolve) => ready.push(resolve))
}

function getLoader(): KTX2Loader {
  if (loader) return loader
  loader = new KTX2Loader()
  const path = transcoderPath()
  if (path) loader.setTranscoderPath(path)
  loader.setWorkerLimit(2)
  if (renderer) loader.detectSupport(renderer)
  return loader
}

function isIndex(value: unknown): value is ContentIndex {
  const v = value as ContentIndex | null
  return !!v && typeof v === 'object' && typeof v.textures === 'object' && v.textures !== null
}

/** The pack's index, or null when no pack is installed (dev's SPA fallback answers HTML). */
export function contentIndex(): Promise<ContentIndex | null> {
  if (indexPending) return indexPending
  indexPending = whenRenderer().then(async () => {
    try {
      const res = await fetch(contentUrl('index.json'))
      const text = res.ok ? await res.text() : ''
      const parsed: unknown = text.trimStart().startsWith('{') ? JSON.parse(text) : null
      if (!isIndex(parsed) || Object.keys(parsed.textures).length === 0) {
        note('no content pack; procedural materials')
        return null
      }
      console.info(`[nestwright] content pack: ${Object.keys(parsed.textures).length} texture sets`)
      return parsed
    } catch {
      note('no content pack; procedural materials')
      return null
    }
  })
  return indexPending
}

/** True unless a compressed texture's base level is not a whole number of 4×4 blocks. */
export function blockAligned(texture: THREE.Texture): boolean {
  if (!(texture as THREE.CompressedTexture).isCompressedTexture) return true
  const image = texture.image as { width?: number; height?: number } | undefined
  const w = image?.width ?? 0
  const h = image?.height ?? 0
  return w % 4 === 0 && h % 4 === 0
}

/**
 * UV repeat for metric UVs. `tileMeters` is the scan's width; a non-square scan (2048×1024)
 * covers proportionally less height, so v repeats faster or the image is stretched.
 */
export function tileRepeat(tileMeters: number, width: number, height: number, scale = 1): [number, number] {
  const aspect = width > 0 && height > 0 ? height / width : 1
  return [scale / tileMeters, scale / (tileMeters * aspect)]
}

function repeatFor(texture: THREE.Texture, info: ContentTexture, scale: number): [number, number] {
  const image = texture.image as { width?: number; height?: number } | undefined
  return tileRepeat(info.tileMeters, image?.width ?? 0, image?.height ?? 0, scale)
}

function prepare(texture: THREE.Texture, colorSpace: THREE.ColorSpace, repeat: [number, number]): THREE.Texture {
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = ANISOTROPY
  texture.colorSpace = colorSpace
  texture.repeat.set(repeat[0], repeat[1])
  texture.needsUpdate = true
  return texture
}

async function loadSet(materialId: string): Promise<PbrMaps | null> {
  const index = await contentIndex()
  const info = index?.textures[materialId]
  if (!info) return null
  const ktx = getLoader()
  const load = (path: string | undefined) => (path ? ktx.loadAsync(contentUrl(path)) : Promise.resolve(null))
  try {
    const [albedo, normal, orm] = await Promise.all([load(info.maps.albedo), load(info.maps.normal), load(info.maps.orm)])
    if (!albedo) return null
    const misfit = [albedo, normal, orm].find((t) => t && !blockAligned(t))
    if (misfit) {
      // WebGPU rejects a block-compressed texture whose size is not a multiple of 4, and the
      // error poisons every draw that binds it. Old packs had a few; keep those procedural.
      note(`content textures for ${materialId} are not block-aligned; procedural materials`)
      for (const t of [albedo, normal, orm]) t?.dispose()
      return null
    }
    const repeat = repeatFor(albedo, info, 1)
    const normalMapTexture = normal ? prepare(normal, THREE.NoColorSpace, repeat) : null
    return {
      info,
      albedo: prepare(albedo, THREE.SRGBColorSpace, repeat),
      normal: normalMapTexture,
      orm: orm ? prepare(orm, THREE.NoColorSpace, repeat) : null,
      normalNode: packedNormalNode(normalMapTexture),
    }
  } catch (err) {
    note(`content textures for ${materialId} failed to load; procedural materials (${err instanceof Error ? err.message : String(err)})`)
    return null
  }
}

function withRepeat(base: PbrMaps, materialId: string, scale: number): PbrMaps {
  if (scale === 1) return base
  const key = `${materialId}|${scale}`
  const hit = scaled.get(key)
  if (hit) return hit
  const repeat = repeatFor(base.albedo, base.info, scale)
  const copy = (t: THREE.Texture | null) => {
    if (!t) return null
    const c = t.clone()
    c.repeat.set(repeat[0], repeat[1])
    c.needsUpdate = true
    return c
  }
  const normal = copy(base.normal)
  const next: PbrMaps = {
    info: base.info,
    albedo: copy(base.albedo)!,
    normal,
    orm: copy(base.orm),
    normalNode: packedNormalNode(normal),
  }
  scaled.set(key, next)
  return next
}

/**
 * Scanned maps for a library material at a texture scale. One load per material id; every
 * material and outdoor twin using it shares the same texture objects (one GPU upload).
 */
export function loadPbrMaps(materialId: string, scale = 1): Promise<PbrMaps | null> {
  let pending = sets.get(materialId)
  if (!pending) {
    pending = loadSet(materialId)
    sets.set(materialId, pending)
  }
  return pending.then((base) => (base ? withRepeat(base, materialId, scale) : null))
}
