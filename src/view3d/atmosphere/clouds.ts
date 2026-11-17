import * as THREE from 'three'
import {
  cameraPosition,
  clamp,
  dot,
  float,
  floor,
  fract,
  Fn,
  Loop,
  max,
  mix,
  normalize,
  positionWorld,
  pow,
  smoothstep,
  uniform,
  vec2,
  vec3,
} from 'three/tsl'

type V3 = THREE.Node<'vec3'>
type F = THREE.Node<'float'>

const hash = Fn(([source]: [V3]) => {
  const p = fract(source.mul(0.3183099).add(vec3(0.11, 0.17, 0.13))).mul(17.0).toVar()
  return fract(p.x.mul(p.y).mul(p.z).mul(p.x.add(p.y).add(p.z)))
})

const noise = Fn(([p]: [V3]) => {
  const i = floor(p).toVar()
  const f0 = fract(p)
  const f = f0.mul(f0).mul(float(3.0).sub(f0.mul(2.0))).toVar()
  const corner = (x: number, y: number, z: number) => hash(i.add(vec3(x, y, z)))
  return mix(
    mix(mix(corner(0, 0, 0), corner(1, 0, 0), f.x), mix(corner(0, 1, 0), corner(1, 1, 0), f.x), f.y),
    mix(mix(corner(0, 0, 1), corner(1, 0, 1), f.x), mix(corner(0, 1, 1), corner(1, 1, 1), f.x), f.y),
    f.z,
  )
})

/**
 * Normalised fbm. `detail` scales every octave after the second, so the far sky (where one pixel
 * spans many noise cells) keeps its big shapes and drops the sparkle. Dividing by the summed
 * amplitude keeps the mean, so the coverage threshold means the same thing at the horizon.
 */
function fbm(octaves: number) {
  return Fn(([source, detail]: [V3, F]) => {
    const p = vec3(source).toVar()
    const v = float(0).toVar()
    const sum = float(0).toVar()
    const a = float(0.5).toVar()
    Loop(octaves, ({ i }) => {
      const w = a.mul(mix(float(1), detail, clamp(float(i).sub(1), 0, 1)))
      v.addAssign(w.mul(noise(p)))
      sum.addAssign(w)
      p.assign(p.mul(2.03).add(vec3(1.7, 9.2, 2.4)))
      a.mulAssign(0.5)
    })
    return v.div(sum)
  })
}

const fbm5 = fbm(5)
const fbm3 = fbm(3)

export interface CloudLookInput {
  /** Fraction of the sky the deck covers, 0..1. */
  coverage: number
  /** Opacity of a thick cloud, 0..1. */
  density: number
  /** Scene radiance (pre tone map) of a sunlit top and a shadowed base. */
  lit: readonly [number, number, number]
  shade: readonly [number, number, number]
  /** Sky radiance at the horizon: far clouds fade into it. */
  horizon: readonly [number, number, number]
  /** Unit vector toward the key light (the sun by day, the moon at night). */
  sun: THREE.Vector3
  /** 0 at night: no silver lining around the moon. */
  day: number
}

export interface CloudDome {
  mesh: THREE.Mesh
  set(look: CloudLookInput): void
  drift(elapsed: number): void
  dispose(): void
}

/**
 * Cumulus on a gently curved deck, seen from below. Every view ray is projected onto the deck, so
 * clouds shrink and crowd toward the horizon instead of sitting on a sphere at one size. Shapes are
 * domain-warped fbm; light comes from one extra density sample toward the sun (the side facing it
 * is thinner, so brighter), thickness darkens the base, and thin edges near the sun glow.
 */
export function createClouds(): CloudDome {
  const uTime = uniform(0)
  const uCoverage = uniform(0.3)
  const uDensity = uniform(0.9)
  const uDay = uniform(1)
  const uLit = uniform(new THREE.Vector3(1, 1, 1))
  const uShade = uniform(new THREE.Vector3(0.5, 0.55, 0.6))
  const uHorizon = uniform(new THREE.Vector3(0.7, 0.75, 0.8))
  const uSun = uniform(new THREE.Vector3(0.35, 0.78, 0.25).normalize())

  const dir = positionWorld.sub(cameraPosition).normalize()
  // Deck coordinates. A flat deck (xz / y) turns every cloud near the horizon into a streak; the
  // +0.3 bends it like a curved deck, so far cumulus flatten about 3:1 and keep their puff.
  const deck = dir.xz.div(max(dir.y, 0).add(0.3))
  const wind = vec2(uTime.mul(0.0016), uTime.mul(0.001))
  const p = deck.add(wind)
  const far = smoothstep(0.14, 0.0, dir.y)
  const detail = float(1).sub(far.mul(0.45))
  const evolve = uTime.mul(0.0012)
  const warp = vec2(fbm3(vec3(p.mul(1.1), 1.3), detail), fbm3(vec3(p.mul(1.1).add(5.2), 7.1), detail))
  const q = p.add(warp.sub(0.5).mul(0.35)).mul(2.4)
  const n = fbm5(vec3(q, evolve), detail)
  const threshold = mix(float(0.55), float(0.3), uCoverage)
  const shape = smoothstep(threshold, threshold.add(0.16), n)
  const thick = smoothstep(threshold, threshold.add(0.32), n)

  // Density one step toward the sun in deck space. Thinner toward the sun = lit side.
  const sunFlat = normalize(vec2(uSun.x, uSun.z).add(vec2(1e-4, 0)))
  const towardSun = fbm5(vec3(q.add(sunFlat.mul(0.06)), evolve), detail)
  const facing = clamp(n.sub(towardSun).mul(7).add(0.45), 0, 1)
  const light = clamp(facing.mul(0.75).add(float(1).sub(thick).mul(0.45)), 0, 1)
  const body = mix(uShade, uLit, light)
  const mu = max(dot(dir, uSun), 0)
  const silver = pow(mu, 10).mul(float(1).sub(thick)).mul(uDay).mul(1.4)
  const lit = body.add(uLit.mul(silver))
  const colour = mix(lit, uHorizon, far.mul(0.45))
  const alpha = shape.mul(uDensity).mul(smoothstep(0.0, 0.04, dir.y)).mul(float(1).sub(far.mul(0.2)))

  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    alphaTest: 0.01,
    fog: false,
  })
  material.colorNode = colour
  material.opacityNode = alpha
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 24), material)
  mesh.name = 'clouds'
  mesh.frustumCulled = false
  mesh.renderOrder = 1
  return {
    mesh,
    set(look) {
      uCoverage.value = look.coverage
      uDensity.value = look.density
      uDay.value = look.day
      uLit.value.set(look.lit[0], look.lit[1], look.lit[2])
      uShade.value.set(look.shade[0], look.shade[1], look.shade[2])
      uHorizon.value.set(look.horizon[0], look.horizon[1], look.horizon[2])
      uSun.value.copy(look.sun)
    },
    drift(elapsed) {
      uTime.value = elapsed
    },
    dispose() {
      mesh.geometry.dispose()
      material.dispose()
    },
  }
}
