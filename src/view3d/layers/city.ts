import * as THREE from 'three'
import {
  abs,
  attribute,
  float,
  floor,
  fract,
  max,
  mix,
  mod,
  normalGeometry,
  positionGeometry,
  sin,
  step,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import {
  ASPHALT_ROUGHNESS,
  GROUND_ENV_INTENSITY,
  PLAZA_TILE_M,
  SIDEWALK_ALBEDO_SRGB,
  STREET_ALBEDO_SRGB,
  cityWindowsGlow,
  facadeLook,
  hash01,
  shellFacadeColor,
  shellGlowFraction,
} from '../../model/cityLook'
import type { Project } from '../../model/types'
import { sunDirection } from '../../model/sunLook'
import { srgbByteToLinear } from '../colorLinear'
import { registerSceneLayer, type SceneLayer, type SceneLayerContext } from '../layers'

const BUILDING_SLOTS = 32
const STREET_REACH = 220
const STREET_WIDTH = 8

interface Block {
  x: number
  z: number
  w: number
  d: number
  h: number
  slot: number
}

function srgbColor(rgb: readonly [number, number, number]): THREE.Color {
  return new THREE.Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace)
}

function hexByte(channel: number): string {
  return Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')
}

function srgbHex(rgb: readonly [number, number, number]): string {
  return `#${hexByte(rgb[0])}${hexByte(rgb[1])}${hexByte(rgb[2])}`
}

type Paint = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function canvas2d(size: number): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: Paint } | null {
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
  const ctx = canvas?.getContext('2d') as Paint | null
  if (!canvas || !ctx) return null
  return { canvas, ctx }
}

function textureFrom(canvas: HTMLCanvasElement | OffscreenCanvas): THREE.Texture {
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/** Fine asphalt grain. Repeat is set per street so a tile stays about a metre, not a city block. */
function asphaltTexture(): THREE.Texture | null {
  const size = 64
  const painted = canvas2d(size)
  if (!painted) return null
  const { canvas, ctx } = painted
  const image = ctx.createImageData(size, size)
  const data = image.data
  const [r, g, b] = STREET_ALBEDO_SRGB
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = (hash01(x * 13.1 + y * 7.7) - 0.5) * 14
      const i = (y * size + x) * 4
      data[i] = Math.max(0, Math.min(255, r + n))
      data[i + 1] = Math.max(0, Math.min(255, g + n * 0.85))
      data[i + 2] = Math.max(0, Math.min(255, b + n * 0.7))
      data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return textureFrom(canvas)
}

/** 4×4 pavers. One repeat is 4 tiles, so 0.5 m each when the repeat is metres / (4 * tile). */
function plazaTexture(): THREE.Texture | null {
  const tiles = 4
  const size = 128
  const painted = canvas2d(size)
  if (!painted) return null
  const { canvas, ctx } = painted
  const [r, g, b] = SIDEWALK_ALBEDO_SRGB
  ctx.fillStyle = `rgb(${r - 8},${g - 7},${b - 6})`
  ctx.fillRect(0, 0, size, size)
  const cell = size / tiles
  const grout = 2
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      const n = (hash01(x * 9.2 + y * 4.1) - 0.5) * 6
      ctx.fillStyle = `rgb(${Math.round(r + n)},${Math.round(g + n * 0.9)},${Math.round(b + n * 0.75)})`
      ctx.fillRect(x * cell + grout, y * cell + grout, cell - grout * 2, cell - grout * 2)
    }
  }
  return textureFrom(canvas)
}

function groundMaterial(map: THREE.Texture | null, albedo: readonly [number, number, number]): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: map ? '#ffffff' : srgbHex(albedo),
    roughness: ASPHALT_ROUGHNESS,
    metalness: 0,
    envMapIntensity: GROUND_ENV_INTENSITY,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
  if (map) {
    map.colorSpace = THREE.SRGBColorSpace
    mat.map = map
  }
  return mat
}

type F = THREE.Node<'float'>

const cityHash = (x: F, y: F): F => fract(sin(vec2(x, y).dot(vec2(127.1, 311.7))).mul(43758.5453))

// PHASE1-PORT: like-for-like TSL port of the instanced facade shader.
/**
 * Procedural facade on a unit box per instance: storey bands, punched or ribbon windows,
 * frames and night-lit panes keyed by a per-instance seed. Same rules as the GLSL it replaced.
 */
function createFacadeMaterial(): { material: THREE.MeshStandardNodeMaterial; night: { value: number } } {
  const night = uniform(0)
  const uGlass = uniform(srgbColor([46, 58, 74]))
  const uWarm = uniform(new THREE.Color().setRGB(1.85, 0.86, 0.38))
  const aFacade = attribute<'vec3'>('aFacade', 'vec3')
  const aSize = attribute<'vec3'>('aSize', 'vec3')
  const aPattern = attribute<'float'>('aPattern', 'float')
  const aGlow = attribute<'float'>('aGlow', 'float')
  const aSeed = attribute<'float'>('aSeed', 'float')
  const local = positionGeometry
  const an = abs(normalGeometry)
  const roof = step(0.6, an.y)
  const wallOnly = float(1).sub(roof)
  const mx = mix(local.x.add(0.5).mul(aSize.x), local.z.add(0.5).mul(aSize.z), step(an.z, an.x))
  const my = local.y.add(0.5).mul(aSize.y)
  const fy = mod(my, 3.0)
  const punched = (insetX: number, y0: number, y1: number): F => {
    const fx = mod(mx, 2.5)
    return step(insetX, fx).mul(step(fx, 2.5 - insetX)).mul(step(y0, fy)).mul(step(fy, y1))
  }
  const ribbon = (y0: number, y1: number): F => step(y0, fy).mul(step(fy, y1))
  const ribbonPattern = step(0.5, aPattern)
  const outer = ribbon(0.88, 2.22)
  const inner = ribbon(1.02, 2.08)
  const mullion = step(0.16, mod(mx, 1.8))
  const hole = punched(0.5, 0.64, 2.28)
  const pane = punched(0.66, 0.8, 2.12)
  const glass = mix(pane, inner.mul(mullion), ribbonPattern).mul(wallOnly)
  const frame = mix(max(hole.sub(pane), 0.0), max(outer.sub(inner), 0.0), ribbonPattern).mul(wallOnly)
  const band = step(mod(my, 3.0), 0.16).mul(wallOnly)
  const pitch = mix(float(2.5), float(1.8), ribbonPattern)
  const cell = cityHash(floor(mx.div(pitch)).add(aSeed.mul(19.0)), floor(my.div(3.0)).add(aSeed.mul(7.0)))
  const lit = step(cell, aGlow).mul(night).mul(step(0.5, glass))
  const banded = aFacade.mul(mix(float(1.0), float(0.84), band))
  const wall0 = mix(banded, aFacade.mul(0.94), roof)
  const wall = mix(wall0, wall0.mul(vec3(0.58, 0.56, 0.54)), frame)
  const material = new THREE.MeshStandardNodeMaterial({
    color: '#ffffff',
    roughness: 0.92,
    metalness: 0,
    envMapIntensity: 1.15,
  })
  material.colorNode = vec4(mix(wall, uGlass, glass), 1)
  material.roughnessNode = mix(float(0.92), float(0.07), glass)
  material.metalnessNode = glass.mul(0.42)
  material.emissiveNode = uWarm.mul(lit)
  return { material, night }
}

function unitBox(project: Project): { minX: number; maxX: number; minZ: number; maxZ: number; top: number } | null {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  let top = 0
  let any = false
  for (const level of project.levels ?? []) {
    if (!level || !Array.isArray(level.walls) || level.walls.length === 0) continue
    any = true
    top = Math.max(top, level.elevation || 0)
    for (const wall of level.walls) {
      minX = Math.min(minX, wall.a.x, wall.b.x)
      maxX = Math.max(maxX, wall.a.x, wall.b.x)
      minZ = Math.min(minZ, wall.a.y, wall.b.y)
      maxZ = Math.max(maxZ, wall.a.y, wall.b.y)
    }
  }
  if (!any || !Number.isFinite(minX)) return null
  return { minX, maxX, minZ, maxZ, top }
}

function skylineBlocks(): Block[] {
  const blocks: Block[] = []
  for (let i = 0; i < BUILDING_SLOTS; i++) {
    const gx = (i % 8) - 3.5
    const gz = Math.floor(i / 8) - 1.5
    const x = gx * 22 + (hash01(i + 3) - 0.5) * 4
    const z = gz * 24 + (hash01(i + 8) - 0.5) * 4
    if (Math.abs(x) < 20 && Math.abs(z) < 16) continue
    blocks.push({
      x,
      z,
      w: 8 + hash01(i + 1) * 8,
      d: 7 + hash01(i + 2) * 7,
      h: 8 + hash01(i + 5) * 28,
      slot: i,
    })
  }
  return blocks
}

function sunAltitude(project: Project): number {
  const env = project.environment
  if (!env) return 0.4
  try {
    const sun = sunDirection(env.dayOfYear ?? 172, env.time ?? 12, env.latitude ?? 41, env.north ?? 0)
    return Math.asin(Math.min(1, Math.max(-1, sun.y)))
  } catch {
    return 0.4
  }
}

export function createCityLayer(ctx: SceneLayerContext): SceneLayer {
  const group = new THREE.Group()
  group.name = 'city'
  group.visible = false

  const asphaltMap = asphaltTexture()
  const ewMap = asphaltMap?.clone() ?? null
  const nsMap = asphaltMap?.clone() ?? null
  for (const map of [ewMap, nsMap]) {
    if (!map) continue
    map.colorSpace = THREE.SRGBColorSpace
    map.wrapS = THREE.RepeatWrapping
    map.wrapT = THREE.RepeatWrapping
    map.needsUpdate = true
  }
  // Plane UVs run 0–1 across the scaled quad. Repeat in metres so the grain stays fine on both axes.
  ewMap?.repeat.set(STREET_REACH, STREET_WIDTH)
  nsMap?.repeat.set(STREET_WIDTH, STREET_REACH)

  const pavement = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    groundMaterial(null, SIDEWALK_ALBEDO_SRGB),
  )
  pavement.rotation.x = -Math.PI / 2
  pavement.position.y = -0.05
  pavement.receiveShadow = true
  pavement.name = 'pavement'
  group.add(pavement)

  const ewMat = groundMaterial(ewMap, STREET_ALBEDO_SRGB)
  const nsMat = groundMaterial(nsMap, STREET_ALBEDO_SRGB)
  const streetGeo = new THREE.PlaneGeometry(1, 1)
  for (let i = -3; i <= 3; i++) {
    const east = new THREE.Mesh(streetGeo, ewMat)
    east.rotation.x = -Math.PI / 2
    east.position.set(0, -0.012, i * 28)
    east.scale.set(STREET_REACH, STREET_WIDTH, 1)
    east.receiveShadow = true
    east.name = 'street'
    group.add(east)
    const north = new THREE.Mesh(streetGeo, nsMat)
    north.rotation.x = -Math.PI / 2
    north.position.set(i * 28, -0.012, 0)
    north.scale.set(STREET_WIDTH, STREET_REACH, 1)
    north.receiveShadow = true
    north.name = 'street'
    group.add(north)
  }

  const plazaMap = plazaTexture()
  const plazaMat = groundMaterial(plazaMap, SIDEWALK_ALBEDO_SRGB)
  plazaMat.polygonOffsetFactor = -2
  plazaMat.polygonOffsetUnits = -2
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), plazaMat)
  plaza.rotation.x = -Math.PI / 2
  plaza.position.y = -0.002
  plaza.receiveShadow = true
  plaza.name = 'plaza'
  group.add(plaza)

  const blocks = skylineBlocks()
  const capacity = blocks.length + 1
  const facade = createFacadeMaterial()
  const box = new THREE.BoxGeometry(1, 1, 1)
  const skyline = new THREE.InstancedMesh(box, facade.material, capacity)
  skyline.name = 'skyline'
  skyline.castShadow = true
  skyline.receiveShadow = true
  skyline.frustumCulled = false
  const facadeAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
  const sizeAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
  const patternAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1)
  const glowAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1)
  const seedAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1)
  box.setAttribute('aFacade', facadeAttr)
  box.setAttribute('aSize', sizeAttr)
  box.setAttribute('aPattern', patternAttr)
  box.setAttribute('aGlow', glowAttr)
  box.setAttribute('aSeed', seedAttr)
  const dummy = new THREE.Object3D()

  const writeBlock = (
    index: number,
    block: { x: number; z: number; w: number; d: number; h: number },
    color: readonly [number, number, number],
    pattern: number,
    glow: number,
    seed: number,
  ) => {
    dummy.position.set(block.x, block.h / 2, block.z)
    dummy.scale.set(Math.max(block.w, 0.01), Math.max(block.h, 0.01), Math.max(block.d, 0.01))
    dummy.rotation.set(0, 0, 0)
    dummy.updateMatrix()
    skyline.setMatrixAt(index, dummy.matrix)
    facadeAttr.setXYZ(index, srgbByteToLinear(color[0]), srgbByteToLinear(color[1]), srgbByteToLinear(color[2]))
    sizeAttr.setXYZ(index, block.w, block.h, block.d)
    patternAttr.setX(index, pattern)
    glowAttr.setX(index, glow)
    seedAttr.setX(index, seed)
  }

  blocks.forEach((block, index) => {
    const look = facadeLook(block.slot)
    writeBlock(index, block, look.color, look.pattern === 'ribbon' ? 1 : 0, look.glow, hash01(block.slot + 4))
  })
  skyline.count = blocks.length
  skyline.instanceMatrix.needsUpdate = true
  facadeAttr.needsUpdate = true
  sizeAttr.needsUpdate = true
  patternAttr.needsUpdate = true
  glowAttr.needsUpdate = true
  seedAttr.needsUpdate = true
  group.add(skyline)

  ctx.scene.add(group)

  const fitPlaza = (width: number, depth: number) => {
    const w = Math.max(width, 8) + 0.4
    const d = Math.max(depth, 8) + 0.4
    plaza.scale.set(w, d, 1)
    const span = PLAZA_TILE_M * 4
    if (plazaMat.map) {
      plazaMat.map.repeat.set(w / span, d / span)
      plazaMat.map.needsUpdate = true
    }
  }
  fitPlaza(24, 24)

  return {
    sync(project: Project) {
      const apartment = project?.kind === 'apartment'
      group.visible = apartment
      if (!apartment) return
      pavement.scale.set(840, 840, 1)
      const terrain = project.terrain
      fitPlaza(terrain?.width > 0 ? terrain.width : 24, terrain?.depth > 0 ? terrain.depth : 24)
      facade.night.value = cityWindowsGlow(sunAltitude(project)) ? 1 : 0
      const shell = unitBox(project)
      const shellIndex = blocks.length
      if (!shell || shell.top < 1.2) {
        skyline.count = blocks.length
        return
      }
      const pad = 0.8
      const id = project.id || project.name || 'apartment'
      writeBlock(
        shellIndex,
        {
          x: (shell.minX + shell.maxX) / 2,
          z: (shell.minZ + shell.maxZ) / 2,
          w: Math.max(2, shell.maxX - shell.minX + pad * 2),
          d: Math.max(2, shell.maxZ - shell.minZ + pad * 2),
          h: shell.top,
        },
        shellFacadeColor(id),
        0,
        shellGlowFraction(id),
        hash01(id.length + 3),
      )
      skyline.count = shellIndex + 1
      skyline.instanceMatrix.needsUpdate = true
      facadeAttr.needsUpdate = true
      sizeAttr.needsUpdate = true
      patternAttr.needsUpdate = true
      glowAttr.needsUpdate = true
      seedAttr.needsUpdate = true
    },
    dispose() {
      ctx.scene.remove(group)
      pavement.geometry.dispose()
      streetGeo.dispose()
      plaza.geometry.dispose()
      box.dispose()
      pavement.material.dispose()
      ewMat.map?.dispose()
      nsMat.map?.dispose()
      ewMat.dispose()
      nsMat.dispose()
      asphaltMap?.dispose()
      plazaMat.map?.dispose()
      plazaMat.dispose()
      facade.material.dispose()
    },
  }
}

registerSceneLayer({
  id: 'city',
  create: createCityLayer,
})
