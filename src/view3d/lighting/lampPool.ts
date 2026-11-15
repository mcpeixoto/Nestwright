import * as THREE from 'three'
import { lampSceneGain } from '../../model/light'

export interface LampCandidate {
  key: string
  /** Camera to lamp, metres. */
  distance: number
  /** Light reach, metres. */
  range: number
  /** The lamp's reach sphere touches the view frustum. */
  inView: boolean
}

/** Lamps already holding a slot keep it unless a rival is clearly more relevant. */
const KEEP_BONUS = 0.8
const OFF_VIEW_PENALTY = 4

function score(c: LampCandidate): number {
  const range = c.range > 0.1 ? c.range : 0.1
  return Math.max(0, c.distance) / range + (c.inView ? 0 : OFF_VIEW_PENALTY)
}

/**
 * Hands `slots` shadow slots to the most relevant lamps: nearest relative to their reach,
 * on screen first. A lamp that keeps its place keeps its slot index, so its shadow map is
 * not re-targeted. Returns one key (or null for an idle slot) per slot.
 */
export function assignLampSlots(
  candidates: readonly LampCandidate[],
  slots: number,
  previous: readonly (string | null)[] = [],
): (string | null)[] {
  const count = Math.max(0, Math.floor(slots))
  const held = new Set(previous.filter((key): key is string => key != null))
  const ranked = candidates
    .filter((c) => Number.isFinite(c.distance) && c.distance <= c.range * 6 + 4)
    .map((c) => ({ key: c.key, value: score(c) * (held.has(c.key) ? KEEP_BONUS : 1) }))
    .sort((a, b) => a.value - b.value || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  const chosen = new Set(ranked.slice(0, count).map((r) => r.key))
  const out: (string | null)[] = new Array<string | null>(count).fill(null)
  for (let i = 0; i < count; i++) {
    const key = previous[i]
    if (key != null && chosen.has(key)) {
      out[i] = key
      chosen.delete(key)
    }
  }
  const rest = [...chosen].sort((a, b) => {
    const ra = ranked.findIndex((r) => r.key === a)
    const rb = ranked.findIndex((r) => r.key === b)
    return ra - rb
  })
  for (let i = 0; i < count && rest.length; i++) {
    if (out[i] == null) out[i] = rest.shift() ?? null
  }
  return out
}

/** Night with auto lights widens lamps' reach (their brightness follows lampSceneGain). */
export const NIGHT_MIN_DISTANCE = 6

interface LampState {
  /** Scene intensity at the current daylight. */
  base: number
  distance: number
}

/**
 * A lamp light's scene intensity: its candela (set by the item builder) times the scene's
 * scale for the current daylight. Lights without a candela keep the intensity they came with.
 */
function lampState(light: THREE.PointLight | THREE.SpotLight, gain: number): LampState {
  const data = light.userData as { lampBase?: number; lampDistance?: number; lampCandela?: number }
  if (data.lampBase === undefined) data.lampBase = light.intensity
  if (data.lampDistance === undefined) data.lampDistance = light.distance
  const base = typeof data.lampCandela === 'number' ? data.lampCandela * gain : data.lampBase
  return { base, distance: data.lampDistance }
}

function shown(obj: THREE.Object3D, root: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = obj
  while (cursor) {
    if (!cursor.visible) return false
    if (cursor === root) return true
    cursor = cursor.parent
  }
  return false
}

export interface LampPool {
  /** Re-assign the pool. `slots` is fixed per tier; a tier change rebuilds the pool once. */
  /**
   * `indoor` says whether a lamp at this world point stands inside a room. Only indoor lamps
   * are pooled: outdoor materials leave the pool out of their light list (see outdoorLights).
   */
  update(slots: number, mapSize: number, revision?: string, indoor?: (p: THREE.Vector3) => boolean): void
  assigned(): (string | null)[]
  dispose(): void
}

/**
 * A fixed set of shadow-casting point lights created once (per tier) and moved onto the
 * lamps that matter. Lamp lights never toggle castShadow and the scene's light count never
 * changes, so materials are not recompiled while orbiting or at nightfall. A lamp that
 * holds a slot is dimmed to 0 and the slot light shines for it.
 */
export function createLampPool(scene: THREE.Scene, camera: THREE.PerspectiveCamera): LampPool {
  const group = new THREE.Group()
  group.name = 'lamp-shadow-pool'
  scene.add(group)
  let pool: THREE.PointLight[] = []
  let keys: (string | null)[] = []
  let lamps: THREE.PointLight[] = []
  /** Spot lamps take part in the daylight scaling only (no shadow slots). */
  let spots: THREE.SpotLight[] = []
  /** Lit lamp shades (userData.shadeNits): their glow follows the same scale. */
  let shades: THREE.Mesh[] = []
  let frame = 0
  let lastSlots = -1
  // Lamp shadow maps are re-rendered only when their lamp, its place or the project changes;
  // six cube faces per lamp every frame was most of the night draw calls.
  let signatures: string[] = []
  let revisionKey = ''
  let dirtyFrames = 0
  const frustum = new THREE.Frustum()
  const matrix = new THREE.Matrix4()
  const sphere = new THREE.Sphere()
  const world = new THREE.Vector3()

  const rebuild = (slots: number, mapSize: number) => {
    for (const light of pool) {
      group.remove(light)
      light.dispose()
    }
    pool = []
    for (let i = 0; i < slots; i++) {
      const light = new THREE.PointLight('#ffffff', 0, 6, 2)
      light.name = `lamp-shadow-${i}`
      light.castShadow = true
      light.shadow.mapSize.set(mapSize, mapSize)
      light.shadow.bias = -0.004
      light.shadow.normalBias = 0.02
      light.shadow.radius = 2
      // Clears the lamp's own shade and bulb, which would otherwise shadow everything.
      light.shadow.camera.near = 0.3
      light.shadow.autoUpdate = false
      light.userData.lampPool = true
      group.add(light)
      pool.push(light)
    }
    keys = new Array<string | null>(slots).fill(null)
    signatures = new Array<string>(slots).fill('')
    lastSlots = slots
  }

  const collect = () => {
    lamps = []
    spots = []
    shades = []
    scene.traverse((obj) => {
      if (typeof obj.userData?.shadeNits === 'number') shades.push(obj as THREE.Mesh)
      const light = obj as THREE.PointLight & THREE.SpotLight
      if (!light.userData?.lampLight) return
      if (light.isPointLight) lamps.push(light)
      else if (light.isSpotLight) spots.push(light)
    })
  }

  return {
    update(slots, mapSize, revision = '', indoor) {
      if (slots !== lastSlots || (pool[0] && pool[0].shadow.mapSize.x !== mapSize)) rebuild(slots, mapSize)
      if (revision !== revisionKey) {
        revisionKey = revision
        // Items rebuild on the frame after a project change; refresh over a few frames.
        dirtyFrames = 3
      }
      const refresh = dirtyFrames > 0
      if (dirtyFrames > 0) dirtyFrames--
      // A rebuilt item brings new lamp lights: pick them up at once, so they are not shown
      // for a few frames at their build-time (daylight) intensity.
      if (frame++ % 10 === 0 || refresh) collect()
      const night = scene.userData.lampNight === true
      const daylight = scene.userData.lampDaylight
      const gain = lampSceneGain(typeof daylight === 'number' ? daylight : 1)
      for (const spot of spots) {
        const state = lampState(spot, gain)
        spot.intensity = state.base
      }
      for (const shade of shades) {
        const material = shade.material as THREE.MeshStandardMaterial
        const nits = shade.userData.shadeNits as number
        if (material?.isMeshStandardMaterial) material.emissiveIntensity = nits * gain
      }
      camera.updateMatrixWorld()
      matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      frustum.setFromProjectionMatrix(matrix, camera.coordinateSystem)
      const byKey = new Map<string, { light: THREE.PointLight; intensity: number; distance: number }>()
      const candidates: LampCandidate[] = []
      for (const light of lamps) {
        const state = lampState(light, gain)
        const intensity = state.base
        const distance = night ? Math.max(state.distance, NIGHT_MIN_DISTANCE) : state.distance
        const live = light.parent != null && shown(light, scene) && intensity > 1e-3
        if (!live) {
          light.intensity = intensity
          light.distance = distance
          continue
        }
        light.getWorldPosition(world)
        if (indoor && !indoor(world)) {
          light.intensity = intensity
          light.distance = distance
          continue
        }
        const range = distance > 0 ? distance : 8
        sphere.set(world, range)
        byKey.set(light.uuid, { light, intensity, distance })
        candidates.push({ key: light.uuid, distance: world.distanceTo(camera.position), range, inView: frustum.intersectsSphere(sphere) })
      }
      keys = assignLampSlots(candidates, pool.length, keys)
      const taken = new Set(keys)
      for (const [key, entry] of byKey) {
        entry.light.intensity = taken.has(key) ? 0 : entry.intensity
        entry.light.distance = entry.distance
      }
      for (let i = 0; i < pool.length; i++) {
        const slot = pool[i]
        if (!slot) continue
        const key = keys[i]
        const entry = key ? byKey.get(key) : undefined
        slot.shadow.autoUpdate = false
        if (!entry) {
          slot.intensity = 0
          signatures[i] = ''
          continue
        }
        entry.light.getWorldPosition(slot.position)
        slot.color.copy(entry.light.color)
        slot.intensity = entry.intensity
        slot.distance = entry.distance
        slot.decay = entry.light.decay
        slot.shadow.camera.far = entry.distance > 0 ? entry.distance : 8
        const p = slot.position
        const signature = `${key}|${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}|${slot.distance.toFixed(2)}`
        if (refresh || signature !== signatures[i]) {
          signatures[i] = signature
          slot.shadow.needsUpdate = true
        }
      }
    },
    assigned() {
      return [...keys]
    },
    dispose() {
      for (const light of lamps) {
        const data = light.userData as { lampBase?: number; lampDistance?: number }
        if (data.lampBase !== undefined) light.intensity = data.lampBase
        if (data.lampDistance !== undefined) light.distance = data.lampDistance
      }
      for (const light of pool) light.dispose()
      scene.remove(group)
      pool = []
      lamps = []
    },
  }
}
