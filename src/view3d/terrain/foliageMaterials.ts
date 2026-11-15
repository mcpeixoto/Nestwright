import * as THREE from 'three'
import {
  attribute,
  atan,
  cameraPosition,
  clamp,
  cos,
  dot,
  float,
  floor,
  fract,
  max,
  mix,
  mod,
  normalize,
  positionGeometry,
  positionLocal,
  positionWorld,
  pow,
  sin,
  texture,
  transformNormalToView,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import { foliageSunColor, foliageSunDir } from '../lighting/foliage'
import { LEAF_SHADE_ATTRIBUTE, PLANT_SWAY_ATTRIBUTE, WIND_ATTRIBUTE } from './treeSpecies'

/**
 * Node materials shared by every tree, bush and hedge. One wind clock for all of them; the
 * shadow pass reuses `positionNode` and the colour alpha, so shadows sway and leaves cut holes.
 */
export const windTime = uniform(0)

type V3 = THREE.Node<'vec3'>

/**
 * World-space wind (node materials apply the instance matrix before `positionNode`): a slow
 * gust that bends the whole plant, its phase keyed to the plant's origin, plus a fast per-card
 * flutter on leaves. The bend leans mostly downwind so trees do not swing symmetrically.
 */
function windOffset(): V3 {
  const wind = attribute<'vec3'>(WIND_ATTRIBUTE, 'vec3')
  const info = attribute<'vec2'>(PLANT_SWAY_ATTRIBUTE, 'vec2')
  const t = windTime
  const ph = info.x
  const gust = sin(t.mul(0.83).add(ph)).mul(0.5).add(sin(t.mul(1.97).add(ph.mul(1.7))).mul(0.22)).add(0.42)
  const bend = wind.x.mul(info.y).mul(gust)
  const flick = sin(t.mul(5.1).add(wind.z).add(ph)).mul(wind.y).mul(info.y).mul(0.03)
  const flock = cos(t.mul(4.3).add(wind.z.mul(1.3))).mul(wind.y).mul(info.y).mul(0.022)
  return vec3(bend.mul(0.93).add(flick), flock, bend.mul(0.36).add(flock))
}

/** 0..1 per plant, from its gust phase: a little hue and value drift between neighbours. */
function plantVary(): THREE.Node<'float'> {
  const info = attribute<'vec2'>(PLANT_SWAY_ATTRIBUTE, 'vec2')
  return fract(sin(info.x.mul(12.9898)).mul(43758.5453))
}

function tinted(base: THREE.Node<'vec3'>, tint: [number, number, number], vary: boolean): THREE.Node<'vec3'> {
  const t = vec3(tint[0], tint[1], tint[2])
  if (!vary) return base.mul(t)
  const v = plantVary()
  // Warmer and a touch lighter one way, cooler and darker the other.
  const drift = mix(vec3(0.9, 0.93, 0.95), vec3(1.08, 1.05, 0.92), v)
  return base.mul(t).mul(drift)
}

export function barkMaterial(
  maps: { color: THREE.Texture | null; normal: THREE.Texture | null; roughness: THREE.Texture | null },
  tint: [number, number, number],
): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 })
  mat.name = 'foliage-bark'
  if (maps.color) {
    const repeat = vec2(maps.color.repeat.x, maps.color.repeat.y)
    mat.colorNode = vec4(tinted(texture(maps.color, uv().mul(repeat)).rgb, tint, true), 1)
  }
  else mat.color.setRGB(0.3 * tint[0], 0.24 * tint[1], 0.18 * tint[2])
  if (maps.normal) mat.normalMap = maps.normal
  if (maps.roughness) mat.roughnessMap = maps.roughness
  mat.positionNode = positionLocal.add(windOffset())
  return mat
}

/** Plain dark core inside a hedge, so the card shell never shows daylight through. */
export function coreMaterial(tint: [number, number, number]): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 })
  mat.name = 'foliage-core'
  mat.colorNode = vec4(tinted(vec3(0.035, 0.07, 0.03), tint, true), 1)
  mat.positionNode = positionLocal.add(windOffset())
  return mat
}

/**
 * Leaf cards: alpha-tested, two-sided, with a cheap forward-scatter term so a canopy seen
 * against the sun glows through instead of going black. The term rides on the sun's colour
 * and strength, and is small enough that a shaded leaf only lifts a little.
 */
export function leafMaterial(map: THREE.Texture | null, tint: [number, number, number]): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.72, metalness: 0, side: THREE.DoubleSide })
  mat.name = 'foliage-leaves'
  mat.alphaTest = 0.5
  const sample = map ? texture(map, uv()) : vec4(0.2, 0.4, 0.15, 1)
  const shade = attribute<'float'>(LEAF_SHADE_ATTRIBUTE, 'float')
  const albedo = tinted(sample.rgb, tint, true)
  mat.colorNode = vec4(albedo.mul(shade), sample.a)
  const view = normalize(positionWorld.sub(cameraPosition))
  // foliageSunDir points at the light: the glow is strongest looking into it through the leaf.
  const forward = pow(clamp(dot(view, foliageSunDir.negate()), 0, 1), float(3))
  mat.emissiveNode = albedo.mul(foliageSunColor).mul(forward.mul(0.32).add(0.03))
  mat.positionNode = positionLocal.add(windOffset())
  return mat
}

/** Flat colour for the impostor bake: what the camera would see at noon, before lighting. */
export function bakeAlbedoMaterial(map: THREE.Texture | null, tint: [number, number, number], leaves: boolean): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial({ side: leaves ? THREE.DoubleSide : THREE.FrontSide })
  if (leaves) mat.alphaTest = 0.5
  const fallback = leaves ? vec4(0.2, 0.4, 0.15, 1) : vec4(0.25, 0.2, 0.15, 1)
  const sample = map ? texture(map, leaves ? uv() : uv().mul(vec2(map.repeat.x, map.repeat.y))) : fallback
  const shade = leaves ? attribute<'float'>(LEAF_SHADE_ATTRIBUTE, 'float') : float(1)
  mat.colorNode = vec4(sample.rgb.mul(vec3(tint[0], tint[1], tint[2])).mul(shade), leaves ? sample.a : float(1))
  return mat
}

/** Object-space normal, packed 0..1, for the impostor bake. */
export function bakeNormalMaterial(map: THREE.Texture | null, leaves: boolean): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial({ side: leaves ? THREE.DoubleSide : THREE.FrontSide })
  if (leaves) mat.alphaTest = 0.5
  const alpha = leaves && map ? texture(map, uv()).a : float(1)
  const n = normalize(attribute<'vec3'>('normal', 'vec3'))
  mat.colorNode = vec4(n.mul(0.5).add(0.5), alpha)
  return mat
}

/** Per-instance impostor data: [x, y, z, scale] and the plant's yaw. */
export const IMPOSTOR_ATTRIBUTE = 'impostor'
export const IMPOSTOR_YAW_ATTRIBUTE = 'impostorYaw'

/**
 * Far trees: a camera-facing quad (turning about y only) that picks one of `frames` views
 * baked around the tree, then shades with the baked normals so it lights like the mesh.
 */
export function impostorMaterial(
  albedo: THREE.Texture,
  normals: THREE.Texture,
  frames: number,
  size: { width: number; height: number; base: number },
): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0, side: THREE.DoubleSide })
  mat.name = 'foliage-impostor'
  mat.alphaTest = 0.5
  const inst = attribute<'vec4'>(IMPOSTOR_ATTRIBUTE, 'vec4')
  const yaw = attribute<'float'>(IMPOSTOR_YAW_ATTRIBUTE, 'float')
  const center = inst.xyz
  const scale = inst.w
  const toCam = cameraPosition.sub(center)
  const flat = normalize(vec3(toCam.x, 0, toCam.z.add(0.0001)))
  const right = vec3(flat.z, 0, flat.x.negate())
  const gx = positionGeometry.x.mul(size.width).mul(scale)
  const gy = positionGeometry.y.mul(size.height).add(size.base).mul(scale)
  mat.positionNode = center.add(right.mul(gx)).add(vec3(0, 1, 0).mul(gy))
  const step = (Math.PI * 2) / frames
  const azimuth = atan(flat.x, flat.z).sub(yaw)
  const frame = mod(floor(azimuth.div(step).add(0.5)), float(frames))
  const local = uv()
  // The bake's render target comes back upside down relative to the card's uv.
  const atlasUv = vec2(frame.add(local.x).div(frames), local.y.oneMinus())
  const color = texture(albedo, atlasUv)
  mat.colorNode = vec4(tinted(color.rgb, [1, 1, 1], true), color.a)
  const packed = texture(normals, atlasUv).xyz.mul(2).sub(1)
  // Baked normals are in the tree's own frame; turn them by the instance yaw.
  const c = cos(yaw)
  const s = sin(yaw)
  const world = normalize(vec3(packed.x.mul(c).add(packed.z.mul(s)), packed.y, packed.z.mul(c).sub(packed.x.mul(s))))
  mat.normalNode = transformNormalToView(world)
  const view = normalize(positionWorld.sub(cameraPosition))
  const forward = pow(max(dot(view, foliageSunDir.negate()), 0), float(3))
  mat.emissiveNode = color.rgb.mul(foliageSunColor).mul(forward.mul(0.25).add(0.03))
  return mat
}
