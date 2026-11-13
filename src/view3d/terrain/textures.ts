import * as THREE from 'three'
import { decodeSplat, splatLength } from '../../model/terrain'
import type { Terrain } from '../../model/types'
import { GROUND_LAYERS } from '../../model/types'

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function paint(size: number, draw: (ctx: Ctx, size: number) => void): THREE.Texture {
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
    tex.colorSpace = THREE.NoColorSpace
    tex.needsUpdate = true
    return tex
  }
  draw(ctx, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.NoColorSpace
  tex.needsUpdate = true
  return tex
}

function speck(ctx: Ctx, size: number, base: string, colors: string[], count: number) {
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[i % colors.length] ?? base
    ctx.globalAlpha = 0.35 + hash(i + 4) * 0.55
    const w = 1 + hash(i + 2) * 5
    ctx.fillRect(hash(i) * size, hash(i + 9) * size, w, w)
  }
  ctx.globalAlpha = 1
}

function layerTexture(kind: string): THREE.Texture {
  const size = 128
  if (kind === 'lawn') {
    return paint(size, (ctx) => speck(ctx, size, '#6f9a52', ['#87b465', '#5d8444', '#9dc56e', '#4f7338'], 2200))
  }
  if (kind === 'meadow') {
    return paint(size, (ctx) => {
      speck(ctx, size, '#8aaa4e', ['#c6d36a', '#6e8f3c', '#d7e28a', '#597833'], 1600)
      ctx.globalAlpha = 0.8
      for (let i = 0; i < 80; i++) {
        ctx.fillStyle = hash(i) > 0.5 ? '#e6d56a' : '#f2f0c8'
        ctx.fillRect(hash(i + 3) * size, hash(i + 8) * size, 2, 2)
      }
      ctx.globalAlpha = 1
    })
  }
  if (kind === 'gravel') {
    return paint(size, (ctx) => {
      ctx.fillStyle = '#b7b1a6'
      ctx.fillRect(0, 0, size, size)
      for (let i = 0; i < 420; i++) {
        ctx.fillStyle = ['#d9d3c6', '#8e877c', '#c4beb2', '#6f6a62'][i % 4] ?? '#aaa'
        ctx.beginPath()
        ctx.ellipse(hash(i) * size, hash(i + 5) * size, 1.2 + hash(i + 2) * 3.5, 1 + hash(i + 7) * 2.4, hash(i) * 6, 0, Math.PI * 2)
        ctx.fill()
      }
    })
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
  if (kind === 'sand') return paint(size, (ctx) => speck(ctx, size, '#e4d2a4', ['#f0e2bb', '#d2bc88', '#c8b48a', '#efe6cf'], 1800))
  if (kind === 'soil') return paint(size, (ctx) => speck(ctx, size, '#7a4e34', ['#8d5b3c', '#5e3a26', '#a06a48', '#4a2e1e'], 1400))
  if (kind === 'path') {
    return paint(size, (ctx) => {
      speck(ctx, size, '#a68462', ['#8d6b4a', '#c4a07a', '#6e5338', '#b89570'], 1500)
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
  return paint(size, (ctx) => {
    speck(ctx, size, '#3e4a32', ['#2c3824', '#5a6844', '#6e5438', '#24301c'], 1200)
    ctx.globalAlpha = 0.7
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = hash(i) > 0.6 ? '#8d5b3c' : '#6a8f4a'
      ctx.beginPath()
      ctx.ellipse(hash(i + 2) * size, hash(i + 6) * size, 4 + hash(i) * 7, 2 + hash(i + 3) * 3, hash(i) * 3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  })
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
         vec2 tuv = vWorld.xz * 0.23;
         vec3 col = texture2D(layer0, tuv).rgb * sw0.r
           + texture2D(layer1, tuv * 1.05).rgb * sw0.g
           + texture2D(layer2, tuv * 1.45).rgb * sw0.b
           + texture2D(layer3, tuv * 0.72).rgb * sw0.a
           + texture2D(layer4, tuv * 1.25).rgb * sw1.r
           + texture2D(layer5, tuv * 1.15).rgb * sw1.g
           + texture2D(layer6, tuv * 0.9).rgb * sw1.b
           + texture2D(layer7, tuv * 1.18).rgb * sw1.a;
         diffuseColor.rgb *= pow(max(col / wsum, vec3(0.0)), vec3(2.2));`,
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
