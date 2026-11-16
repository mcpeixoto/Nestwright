import * as THREE from 'three'
import { attribute, clamp, exp, materialColor, max, mix, mx_noise_float, positionWorld, smoothstep, step, uv, vec2, vec3, vec4 } from 'three/tsl'

/**
 * Per-vertex weathering data on exterior wall faces (see `buildWall`):
 *   x: world height the rain runs down from (a sill, or the eaves),
 *   y: how strongly it streaks (1 under a sill, less under eaves, 0 for none),
 *   z: world height of the ground the rain splashes up from (`NO_SPLASH` above the ground floor).
 */
export const FACADE_ATTRIBUTE = 'weather'
export const NO_SPLASH = -1e4
/** Streak strength under a window sill, and under the eaves of the top storey. */
export const SILL_DRIP = 1
export const EAVE_DRIP = 0.35

export const FACADE = {
  /** Splash-back grime fades out between these heights above the ground (m). */
  splashFrom: 0.2,
  splashTo: 1.1,
  splashDarken: 0.55,
  /** Streaks fade with distance below their source; e-folding length (m). */
  streakLength: 1.1,
  streakDarken: 0.6,
  /** Large-scale colour drift, ± fraction of the albedo. */
  macroAmount: 0.14,
  /** Dirt is a warm grey-brown, not black. */
  grime: new THREE.Color(0.48, 0.44, 0.38),
} as const

/** Node slots three's WebGPU build reads off a classic material. */
type NodeSlots = THREE.MeshStandardMaterial & { colorNode?: THREE.Node | null }

const weathered = new WeakSet<THREE.Material>()

/**
 * The facade colour: the material's own colour (scan or procedural) with a slow colour drift,
 * splash-back grime along the ground and rain streaks under sills and eaves. World-space noise,
 * so neighbouring walls weather as one surface and the pattern never tiles with the scan.
 */
export function facadeColorNode(base: THREE.Node = materialColor): THREE.Node<'vec4'> {
  const w = attribute(FACADE_ATTRIBUTE, 'vec3')
  const p = positionWorld
  // uv.x runs along the wall in metres; world x/z alone would smear on diagonal walls.
  const along = uv().x

  const macro = mx_noise_float(p.mul(0.3)).mul(0.65).add(mx_noise_float(p.mul(1.9)).mul(0.35))

  const ragged = mx_noise_float(vec2(along.mul(2.5), p.y.mul(0.6))).mul(0.18)
  const height = p.y.sub(w.z).add(ragged)
  const splash = smoothstep(FACADE.splashFrom, FACADE.splashTo, height).oneMinus()

  const below = w.x.sub(p.y)
  const fall = exp(max(below, 0).negate().div(FACADE.streakLength)).mul(step(0, below))
  const streaks = smoothstep(0.2, 0.65, mx_noise_float(vec2(along.mul(5), p.y.mul(0.3))))
  const streak = streaks.mul(fall).mul(w.y)

  const grime = clamp(splash.mul(FACADE.splashDarken).add(streak.mul(FACADE.streakDarken)), 0, 0.7)
  const c = vec4(base as THREE.Node<'vec4'>)
  const drifted = c.rgb.mul(macro.mul(FACADE.macroAmount).add(1))
  const tint = vec3(FACADE.grime.r, FACADE.grime.g, FACADE.grime.b)
  return vec4(mix(drifted, drifted.mul(tint), grime), c.a)
}

/** Put the facade weathering on a material once. Glass and transparent materials stay clean. */
export function attachFacadeWeathering(material: THREE.Material): void {
  const mat = material as NodeSlots
  if (!mat.isMeshStandardMaterial || weathered.has(mat) || mat.transparent) return
  weathered.add(mat)
  mat.colorNode = facadeColorNode(mat.colorNode ?? materialColor)
  mat.userData = { ...mat.userData, facade: true }
  mat.needsUpdate = true
}
