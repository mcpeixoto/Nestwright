import * as THREE from 'three'
import {
  cameraViewMatrix,
  int,
  materialColor,
  max,
  mx_noise_float,
  normalize,
  normalView,
  positionWorld,
  texture,
  uniform,
  uv,
  vec3,
  vec4,
} from 'three/tsl'
import { albedoTint, loadPbrMaps, type PbrMaps } from '../../materials/pbrTextures'
import { decodeSplat, splatLength } from '../../model/terrain'
import type { Terrain } from '../../model/types'
import { GROUND_LAYERS } from '../../model/types'

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Lawn albedo. The lit lawn at noon should sit near sRGB (77, 123, 61). */
export const LAWN_ALBEDO = { r: 76, g: 112, b: 48 } as const

/** Same bytes the lawn splat texture bakes, so the surround seam can match it. */
export function lawnAlbedoAt(worldX: number, worldZ: number): [number, number, number] {
  const u = worldX * 0.07
  const v = worldZ * 0.07
  const fu = u - Math.floor(u)
  const fv = v - Math.floor(v)
  return lawnTexel(fu, fv)
}

function lawnTexel(u: number, v: number): [number, number, number] {
  const n = fbm(u * 5, v * 5)
  const blade = Math.sin((u * 18 + v * 2.2) * Math.PI * 2) * 0.5 + 0.5
  const mix = n * 0.65 + blade * 0.12
  return [
    clampByte(LAWN_ALBEDO.r + mix * 16),
    clampByte(LAWN_ALBEDO.g + mix * 14),
    clampByte(LAWN_ALBEDO.b + mix * 10),
  ]
}

function paint(size: number, draw: (ctx: Ctx, size: number) => void, color = true): THREE.Texture {
  const space = color ? THREE.SRGBColorSpace : THREE.NoColorSpace
  let canvas: HTMLCanvasElement | OffscreenCanvas | null = null
  if (typeof document !== 'undefined') {
    const el = document.createElement('canvas')
    el.width = size
    el.height = size
    canvas = el
  } else if (typeof OffscreenCanvas !== 'undefined') {
    try {
      canvas = new OffscreenCanvas(size, size)
    } catch {
      canvas = null
    }
  }
  const ctx = canvas?.getContext('2d') as Ctx | null
  if (!canvas || !ctx) {
    const data = new Uint8Array([120, 140, 80, 255])
    const tex = new THREE.DataTexture(data, 1, 1)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.colorSpace = space
    tex.needsUpdate = true
    return tex
  }
  draw(ctx, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = space
  tex.needsUpdate = true
  return tex
}

function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const n = (i: number, j: number) => hash(i * 73.13 + j * 19.73)
  const a = n(ix, iy)
  const b = n(ix + 1, iy)
  const c = n(ix, iy + 1)
  const d = n(ix + 1, iy + 1)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

function fbm(x: number, y: number): number {
  let value = 0
  let amplitude = 0.55
  let frequency = 1
  for (let octave = 0; octave < 4; octave++) {
    value += amplitude * valueNoise(x * frequency, y * frequency)
    amplitude *= 0.5
    frequency *= 2
  }
  return value
}

function field(ctx: Ctx, size: number, sample: (u: number, v: number) => [number, number, number]): void {
  const image = ctx.createImageData(size, size)
  const data = image.data
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = sample(x / size, y / size)
      const i = (y * size + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function layerTexture(kind: string): THREE.Texture {
  const size = 128
  if (kind === 'lawn') {
    return paint(size, (ctx) => field(ctx, size, (u, v) => lawnTexel(u, v)))
  }
  if (kind === 'meadow') {
    return paint(size, (ctx) =>
      field(ctx, size, (u, v) => {
        const n = fbm(u * 4, v * 4)
        const fleck = valueNoise(u * 22, v * 22) > 0.82 ? 18 : 0
        return [clampByte(96 + n * 20 + fleck), clampByte(124 + n * 16), clampByte(52 + n * 12)]
      }),
    )
  }
  if (kind === 'gravel') {
    return paint(size, (ctx) =>
      field(ctx, size, (u, v) => {
        const n = fbm(u * 9, v * 9)
        const pebble = valueNoise(u * 28, v * 26)
        const shade = n * 0.55 + pebble * 0.2
        return [clampByte(150 + shade * 28), clampByte(146 + shade * 24), clampByte(136 + shade * 20)]
      }),
    )
  }
  if (kind === 'paving') {
    return paint(size, (ctx) => {
      ctx.fillStyle = '#6d7370'
      ctx.fillRect(0, 0, size, size)
      const cols = 4
      const rows = 5
      const gw = 4
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const shade = 150 + Math.floor(hash(x * 9 + y) * 50)
          ctx.fillStyle = `rgb(${shade - 8},${shade},${shade - 4})`
          const wobble = (y % 2) * 8
          ctx.fillRect(x * (size / cols) + gw + wobble * 0.15, y * (size / rows) + gw, size / cols - gw * 2, size / rows - gw * 2)
        }
      }
    })
  }
  if (kind === 'sand') {
    return paint(size, (ctx) =>
      field(ctx, size, (u, v) => {
        const n = fbm(u * 6, v * 6)
        return [clampByte(176 + n * 16), clampByte(154 + n * 14), clampByte(112 + n * 12)]
      }),
    )
  }
  if (kind === 'soil') {
    return paint(size, (ctx) =>
      field(ctx, size, (u, v) => {
        const n = fbm(u * 5, v * 5)
        return [clampByte(92 + n * 18), clampByte(58 + n * 12), clampByte(36 + n * 10)]
      }),
    )
  }
  if (kind === 'path') {
    return paint(size, (ctx) => {
      field(ctx, size, (u, v) => {
        const n = fbm(u * 7, v * 4)
        const streak = Math.sin(v * Math.PI * 10) * 6
        return [clampByte(138 + n * 16 + streak), clampByte(104 + n * 12), clampByte(72 + n * 10)]
      })
      ctx.strokeStyle = 'rgba(70,48,30,0.25)'
      ctx.lineWidth = 2
      for (let y = 8; y < size; y += 14) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(size, y + 2)
        ctx.stroke()
      }
    })
  }
  return paint(size, (ctx) =>
    field(ctx, size, (u, v) => {
      const n = fbm(u * 5, v * 5)
      return [clampByte(48 + n * 16), clampByte(62 + n * 14), clampByte(36 + n * 10)]
    }),
  )
}

const LAYER_KINDS = ['lawn', 'meadow', 'gravel', 'paving', 'sand', 'soil', 'path', 'forest-floor'] as const

let cachedLayers: THREE.Texture[] | null = null

export function groundLayerTextures(): THREE.Texture[] {
  if (cachedLayers) return cachedLayers
  cachedLayers = LAYER_KINDS.map((kind) => layerTexture(kind))
  return cachedLayers
}

/** Side of every painted ground layer, in texels. */
const LAYER_SIZE = 128

/** RGBA bytes of a painted layer at LAYER_SIZE: read from its canvas, or the fallback's one texel spread. */
function layerPixels(tex: THREE.Texture): Uint8Array {
  const out = new Uint8Array(LAYER_SIZE * LAYER_SIZE * 4)
  const image = tex.image as (HTMLCanvasElement | OffscreenCanvas | { data?: ArrayLike<number> }) | undefined
  const ctx =
    image && 'getContext' in image ? (image.getContext('2d') as Ctx | null) : null
  if (ctx) {
    out.set(ctx.getImageData(0, 0, LAYER_SIZE, LAYER_SIZE).data)
    return out
  }
  const texel = (image && 'data' in image ? image.data : undefined) ?? [120, 140, 80, 255]
  for (let i = 0; i < out.length; i += 4) {
    out[i] = texel[0] ?? 0
    out[i + 1] = texel[1] ?? 0
    out[i + 2] = texel[2] ?? 0
    out[i + 3] = texel[3] ?? 255
  }
  return out
}

let cachedArray: THREE.DataArrayTexture | null = null

/**
 * Layers 1–7 (every one but the lawn, which the scan replaces) as one array texture. three gives
 * each distinct texture its own sampler, and a fragment stage gets 16: at Ultra, seven separate
 * layer textures plus shadows, environment and probes made 17, so WebGPU dropped the ground.
 */
export function groundLayerArray(): THREE.DataArrayTexture {
  if (cachedArray) return cachedArray
  const layers = groundLayerTextures().slice(1)
  const stride = LAYER_SIZE * LAYER_SIZE * 4
  const data = new Uint8Array(stride * layers.length)
  layers.forEach((tex, i) => data.set(layerPixels(tex), i * stride))
  const array = new THREE.DataArrayTexture(data, LAYER_SIZE, LAYER_SIZE, layers.length)
  array.wrapS = THREE.RepeatWrapping
  array.wrapT = THREE.RepeatWrapping
  array.magFilter = THREE.LinearFilter
  array.minFilter = THREE.LinearMipmapLinearFilter
  array.generateMipmaps = true
  array.colorSpace = THREE.SRGBColorSpace
  array.needsUpdate = true
  cachedArray = array
  return array
}

export interface SplatMaterial extends THREE.MeshStandardNodeMaterial {
  userData: THREE.MeshStandardNodeMaterial['userData'] & {
    syncSplat?: (terrain: Terrain) => void
  }
}

function dataTexture(data: Uint8Array, size: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.generateMipmaps = false
  tex.colorSpace = THREE.NoColorSpace
  tex.flipY = false
  tex.needsUpdate = true
  return tex
}

/** Per-layer tiling, relative to the 0.07 / m base. */
const LAYER_TILING = [1, 1.05, 1.45, 0.72, 1.25, 1.15, 0.9, 1.18] as const
const BASE_TILING = 0.07

/** Library material whose scan replaces the procedural lawn layer once the content pack loads. */
export const LAWN_SCAN_ID = 'lawn-fine'
/** Strength of the scanned lawn's relief. Grass blades cover most of it; this is for the gaps. */
const LAWN_NORMAL_STRENGTH = 0.6
/** How far (±) the two-scale macro noise moves lawn and meadow brightness. */
export const LAWN_MACRO_AMOUNT = 0.16

function flatNormalTexture(): THREE.DataTexture {
  // Two-channel normal (X in G, Y in A, as the content pipeline packs it): 128 reads as 0, so flat.
  const tex = new THREE.DataTexture(new Uint8Array([128, 128, 128, 128]), 1, 1, THREE.RGBAFormat)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.NoColorSpace
  tex.needsUpdate = true
  return tex
}

/** `LAWN_ALBEDO` as a hex colour: what a lawn scan is tinted to average. */
export function lawnHex(): string {
  const hex = (v: number) => v.toString(16).padStart(2, '0')
  return `#${hex(LAWN_ALBEDO.r)}${hex(LAWN_ALBEDO.g)}${hex(LAWN_ALBEDO.b)}`
}

/**
 * World-space brightness multiplier for lawn and meadow: a broad ~22 m swell plus ~3 m patches.
 * The noise is zero-mean, so the average lawn colour (and the lit-colour test) stays where it
 * was while the scan's 2.5 m tile stops reading as a grid from the air.
 */
function macroVariation(): THREE.Node<'float'> {
  const xz = positionWorld.xz
  const broad = mx_noise_float(xz.mul(0.045))
  const patch = mx_noise_float(xz.mul(0.33))
  return broad.mul(0.65).add(patch.mul(0.35)).mul(LAWN_MACRO_AMOUNT * 2).add(1)
}

interface LawnSlots {
  albedo: THREE.TextureNode
  normal: THREE.TextureNode
  tiling: THREE.UniformNode<'float', number>
  tint: THREE.UniformNode<'color', THREE.Color>
}

/**
 * Put a scanned lawn into a splat material: its albedo (tinted to average `LAWN_ALBEDO`), its
 * relief and its tile size. Only bindings and uniforms change, so the shader is not rebuilt.
 * False, and the procedural lawn stays, when the scan is too far from the lawn colour to tint.
 */
export function applyLawnScan(mat: SplatMaterial, maps: PbrMaps): boolean {
  const slots = mat.userData.lawn as LawnSlots | undefined
  if (!slots) return false
  const tint = albedoTint(lawnHex(), maps.info.meanAlbedoSrgb)
  if (!tint || !(maps.info.tileMeters > 0)) return false
  slots.albedo.value = maps.albedo
  if (maps.normal) slots.normal.value = maps.normal
  slots.tiling.value = 1 / maps.info.tileMeters
  slots.tint.value.copy(tint)
  mat.userData.scanned = maps.info.key
  return true
}

// PHASE1-PORT: like-for-like TSL port of the 8-layer ground splat. The lawn layer takes the
// scanned albedo and relief once the content pack has them (realism A2); the others are still art.
/**
 * Two RGBA weight maps (eight ground layers) blend eight tiled colour textures, sampled in
 * world XZ. Colour maps are SRGBColorSpace, so the sampler already returns linear values.
 */
export function createSplatMaterial(): SplatMaterial {
  const layers = groundLayerTextures()
  const layerArray = groundLayerArray()
  const splat0 = texture(dataTexture(new Uint8Array(4), 1), uv())
  const splat1 = texture(dataTexture(new Uint8Array(4), 1), uv())
  const uniforms = { splat0, splat1 }
  const sw0 = splat0
  const sw1 = splat1
  const weights = [sw0.r, sw0.g, sw0.b, sw0.a, sw1.r, sw1.g, sw1.b, sw1.a]
  const tuv = positionWorld.xz.mul(BASE_TILING)
  // Tiling and tint are uniforms so the scan can replace the procedural lawn without a new shader.
  const flatNormal = flatNormalTexture()
  const lawnTiling = uniform(BASE_TILING * LAYER_TILING[0])
  const lawnTint = uniform(new THREE.Color(1, 1, 1))
  const lawnUv = positionWorld.xz.mul(lawnTiling)
  const lawnAlbedo = texture(layers[0]!, lawnUv)
  const lawnNormal = texture(flatNormal, lawnUv)
  const macro = macroVariation()
  let col: THREE.Node<'vec3'> | null = null
  let wsum: THREE.Node<'float'> | null = null
  for (let i = 0; i < LAYER_TILING.length; i++) {
    const layer = layers[i]
    const weight = weights[i]
    if (!layer || !weight) continue
    let sample: THREE.Node<'vec3'> =
      i === 0 ? lawnAlbedo.rgb.mul(lawnTint) : texture(layerArray, tuv.mul(LAYER_TILING[i] ?? 1)).depth(int(i - 1)).rgb
    // Lawn and meadow get the macro swell; paving, gravel and paths stay even.
    if (i <= 1) sample = sample.mul(macro)
    const term = sample.mul(weight)
    col = col ? col.add(term) : term
    wsum = wsum ? wsum.add(weight) : weight
  }
  const mat = new THREE.MeshStandardNodeMaterial({
    color: '#ffffff',
    roughness: 0.94,
    metalness: 0,
  }) as SplatMaterial
  mat.polygonOffset = true
  mat.polygonOffsetFactor = 1
  mat.polygonOffsetUnits = 1
  if (col && wsum) {
    mat.colorNode = materialColor.mul(max(col.div(max(wsum, 0.0001)), vec3(0.0)))
    // Scanned relief, weighted by the lawn's share. The terrain is near flat and its UVs belong
    // to the splat, not the scan, so the detail is tilted in world XZ and taken to view space.
    const lawnShare = weights[0]!.div(max(wsum, 0.0001))
    const nx = lawnNormal.g.mul(2).sub(1)
    const nz = lawnNormal.a.mul(2).sub(1)
    const detail = cameraViewMatrix.mul(vec4(nx, 0, nz, 0)).xyz.mul(LAWN_NORMAL_STRENGTH)
    mat.normalNode = normalize(normalView.add(detail.mul(lawnShare)))
  }
  const lawn: LawnSlots = { albedo: lawnAlbedo, normal: lawnNormal, tiling: lawnTiling, tint: lawnTint }
  mat.userData.lawn = lawn
  void loadPbrMaps(LAWN_SCAN_ID).then((maps) => {
    if (maps && mat.userData.lawn) applyLawnScan(mat, maps)
  })
  mat.userData.syncSplat = (terrain: Terrain) => {
    const resolution = terrain.resolution
    if (!(resolution >= 1)) return
    const n = resolution + 1
    const weights = decodeSplat(terrain.splat, splatLength(terrain))
    const resize = (slot: 'splat0' | 'splat1') => {
      const current = uniforms[slot].value as THREE.DataTexture
      if (current.image?.width === n && current.image?.data?.length === n * n * 4) return current
      current.dispose()
      const next = dataTexture(new Uint8Array(n * n * 4), n)
      uniforms[slot].value = next
      return next
    }
    const tex0 = resize('splat0')
    const tex1 = resize('splat1')
    const a = tex0.image.data as Uint8Array
    const b = tex1.image.data as Uint8Array
    const samples = Math.min(n * n, Math.floor(weights.length / GROUND_LAYERS.length))
    for (let i = 0; i < samples; i++) {
      const s = i * GROUND_LAYERS.length
      const d = i * 4
      a[d] = weights[s] ?? 0
      a[d + 1] = weights[s + 1] ?? 0
      a[d + 2] = weights[s + 2] ?? 0
      a[d + 3] = weights[s + 3] ?? 0
      b[d] = weights[s + 4] ?? 0
      b[d + 1] = weights[s + 5] ?? 0
      b[d + 2] = weights[s + 6] ?? 0
      b[d + 3] = weights[s + 7] ?? 0
    }
    tex0.needsUpdate = true
    tex1.needsUpdate = true
    mat.userData.owned = [tex0, tex1]
  }
  mat.userData.owned = [uniforms.splat0.value, uniforms.splat1.value]
  mat.userData.flatNormal = flatNormal
  return mat
}

export function disposeSplatMaterial(mat: SplatMaterial): void {
  const owned = mat.userData.owned as THREE.Texture[] | undefined
  owned?.forEach((tex) => tex.dispose())
  // The scan's textures are shared through pbrTextures; only the placeholder is ours.
  ;(mat.userData.flatNormal as THREE.Texture | undefined)?.dispose()
  mat.userData.lawn = undefined
  mat.userData.syncSplat = undefined
  mat.dispose()
}
