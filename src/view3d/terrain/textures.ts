import * as THREE from 'three'
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

export interface SplatMaterial extends THREE.MeshStandardMaterial {
  userData: THREE.MeshStandardMaterial['userData'] & {
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

export function createSplatMaterial(): SplatMaterial {
  const layers = groundLayerTextures()
  const uniforms = {
    splat0: { value: dataTexture(new Uint8Array(4), 1) },
    splat1: { value: dataTexture(new Uint8Array(4), 1) },
    layer0: { value: layers[0] },
    layer1: { value: layers[1] },
    layer2: { value: layers[2] },
    layer3: { value: layers[3] },
    layer4: { value: layers[4] },
    layer5: { value: layers[5] },
    layer6: { value: layers[6] },
    layer7: { value: layers[7] },
  }
  const mat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.94,
    metalness: 0,
  }) as SplatMaterial
  mat.polygonOffset = true
  mat.polygonOffsetFactor = 1
  mat.polygonOffsetUnits = 1
  mat.customProgramCacheKey = () => 'nestwright-ground-splat'
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSplatUv;\nvarying vec3 vWorld;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvSplatUv = uv;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorld = worldPosition.xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec2 vSplatUv;
         varying vec3 vWorld;
         uniform sampler2D splat0;
         uniform sampler2D splat1;
         uniform sampler2D layer0;
         uniform sampler2D layer1;
         uniform sampler2D layer2;
         uniform sampler2D layer3;
         uniform sampler2D layer4;
         uniform sampler2D layer5;
         uniform sampler2D layer6;
         uniform sampler2D layer7;`,
      )
      .replace(
        '#include <map_fragment>',
        `vec4 sw0 = texture2D(splat0, vSplatUv);
         vec4 sw1 = texture2D(splat1, vSplatUv);
         float wsum = sw0.r + sw0.g + sw0.b + sw0.a + sw1.r + sw1.g + sw1.b + sw1.a;
         wsum = max(wsum, 0.0001);
         vec2 tuv = vWorld.xz * 0.07;
         vec3 col = texture2D(layer0, tuv).rgb * sw0.r
           + texture2D(layer1, tuv * 1.05).rgb * sw0.g
           + texture2D(layer2, tuv * 1.45).rgb * sw0.b
           + texture2D(layer3, tuv * 0.72).rgb * sw0.a
           + texture2D(layer4, tuv * 1.25).rgb * sw1.r
           + texture2D(layer5, tuv * 1.15).rgb * sw1.g
           + texture2D(layer6, tuv * 0.9).rgb * sw1.b
           + texture2D(layer7, tuv * 1.18).rgb * sw1.a;
         // Colour maps are SRGBColorSpace, so the GPU already decoded them.
         diffuseColor.rgb *= max(col / wsum, vec3(0.0));`,
      )
  }
  mat.userData.syncSplat = (terrain: Terrain) => {
    const resolution = terrain.resolution
    if (!(resolution >= 1)) return
    const n = resolution + 1
    const weights = decodeSplat(terrain.splat, splatLength(terrain))
    const resize = (slot: 'splat0' | 'splat1') => {
      const current = uniforms[slot].value
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
  return mat
}

export function disposeSplatMaterial(mat: SplatMaterial): void {
  const owned = mat.userData.owned as THREE.Texture[] | undefined
  owned?.forEach((tex) => tex.dispose())
  mat.userData.syncSplat = undefined
  mat.dispose()
}
