import * as THREE from 'three'
import { CSMShadowNode } from 'three/examples/jsm/csm/CSMShadowNode.js'
import type { GraphicsQuality } from '../../settings'
import { cascadeBreaks, cascadeRefresh, cascadeTuning, holdOrSnap, sunShadowTier } from './cascades'
import type { ShadowFocus } from './focus'

/**
 * Light-space distance from each cascade's slice to its shadow camera. Casters up to this
 * far towards the light still land in the map: a 10 m house under a 10° sun is ~60 m away.
 */
const LIGHT_MARGIN = 90

export interface SunShadowFrame {
  tier: GraphicsQuality
  focus: ShadowFocus
  /** The key light is the moon: slightly lighter shadows. */
  night: boolean
  /** False when the key light is too dim to matter; the cascades then stop re-rendering. */
  active: boolean
  /** WebGL2 backend: 16 texture units, so at most 3 cascades. */
  webgl?: boolean
  /** Changes when the project does; every cascade then re-renders at once. */
  revision?: string
}

export interface SunShadow {
  update(frame: SunShadowFrame): void
  /** Current cascade far ends in metres (for the perf HUD and tests in the browser). */
  info(): { cascades: number; mapSize: number; far: number; breaks: number[]; indoor: boolean }
  dispose(): void
}

/**
 * Cascaded sun (or moon) shadows through three's CSMShadowNode. The light keeps
 * castShadow on for its whole life, so day/night and orbiting never change the light set
 * the materials were compiled for; only a tier change rebuilds the node.
 *
 * Why CSMShadowNode over the r186 SunLight: SunLight hard-codes two cascades in its
 * shader chunks and says itself it is not for small bounded scenes, while the tiers need
 * 2–4 cascades and a room-sized first cascade indoors.
 */
export function createSunShadow(light: THREE.DirectionalLight, camera: THREE.PerspectiveCamera): SunShadow {
  let node: CSMShadowNode | null = null
  let tierKey = ''
  let mapSize = 2048
  let cascades = 3
  let far: number | null = null
  let start: number | null = null
  let focus: number | null = null
  let indoor = false
  let frustumKey = ''
  let tuned = false
  let lastActive = true
  let lastNight = false
  let tick = 0
  let forceFrames = 0
  let lastRevision = ''
  const dir = new THREE.Vector3()
  const lastDir = new THREE.Vector3()
  const camMatrix = new THREE.Matrix4()

  const split = (count: number, near: number, cameraFar: number, breaks: number[]) => {
    breaks.length = 0
    for (const value of cascadeBreaks({ cascades: count, near, far: cameraFar, start: start ?? near, focus })) breaks.push(value)
  }

  const build = (tier: GraphicsQuality, webgl: boolean) => {
    const spec = sunShadowTier(tier)
    mapSize = spec.mapSize
    cascades = webgl ? Math.min(3, spec.cascades) : spec.cascades
    light.castShadow = true
    light.shadow.mapSize.set(mapSize, mapSize)
    light.shadow.camera.near = 0.5
    light.shadow.camera.far = LIGHT_MARGIN + 400
    light.shadow.bias = -0.0001
    light.shadow.normalBias = 0.02
    light.shadow.radius = 1.25
    const previous = node
    node = new CSMShadowNode(light, {
      cascades,
      maxFar: far ?? 120,
      mode: 'custom',
      lightMargin: LIGHT_MARGIN,
      customSplitsCallback: split,
    })
    node.fade = true
    light.shadow.shadowNode = node
    if (previous) {
      previous.dispose()
      // The light node caches its shadow colour node; this drops it so the new one is used.
      ;(light as unknown as THREE.EventDispatcher<{ dispose: object }>).dispatchEvent({ type: 'dispose' })
    }
    frustumKey = ''
    tuned = false
  }

  const tune = (csm: CSMShadowNode) => {
    for (let i = 0; i < csm.lights.length; i++) {
      const shadow = csm.lights[i]?.shadow
      if (!shadow) continue
      const cam = shadow.camera
      const width = cam.right - cam.left
      cam.near = 0.5
      cam.far = LIGHT_MARGIN + width * 1.5 + 20
      cam.updateProjectionMatrix()
      const t = cascadeTuning(i, width, shadow.mapSize.width, cam.far - cam.near)
      shadow.bias = t.bias
      shadow.normalBias = t.normalBias
      shadow.radius = t.radius
      shadow.intensity = lastNight ? 0.8 : 1
      shadow.autoUpdate = false
    }
    tuned = csm.lights.length > 0
    forceFrames = 2
  }

  /** Staggered re-renders (cascadeDue), or all cascades for a couple of frames after a change. */
  const schedule = (csm: CSMShadowNode) => {
    tick++
    const all = forceFrames > 0
    if (forceFrames > 0) forceFrames--
    camera.updateMatrixWorld()
    const moving = !camMatrix.equals(camera.matrixWorld)
    camMatrix.copy(camera.matrixWorld)
    if (!lastActive) return
    const count = csm.lights.length
    const wide = !indoor && (start ?? 0) > 8
    for (let i = 0; i < count; i++) {
      const shadow = csm.lights[i]?.shadow
      if (!shadow) continue
      if (all || cascadeRefresh({ index: i, count, frame: tick, moving, night: lastNight, wide })) shadow.needsUpdate = true
    }
  }

  return {
    update(frame) {
      const nextKey = `${frame.tier}|${frame.webgl ? 1 : 0}`
      if (nextKey !== tierKey) {
        tierKey = nextKey
        build(frame.tier, frame.webgl === true)
      }
      const csm = node
      if (!csm) return
      // The node grabs the first camera it is built with; keep it on the view camera.
      if (csm.camera && csm.camera !== camera) {
        csm.camera = camera
        frustumKey = ''
      }
      far = holdOrSnap(far, frame.focus.far, 0.12, 5)
      start = holdOrSnap(start, frame.focus.start, 0.15, 1)
      focus = frame.focus.focus == null ? null : Math.round(frame.focus.focus * 2) / 2
      indoor = frame.focus.indoor
      const key = `${camera.fov}|${camera.aspect.toFixed(4)}|${camera.near}|${camera.zoom}|${far}|${start}|${focus}`
      const flags = frame.active !== lastActive || frame.night !== lastNight
      lastActive = frame.active
      lastNight = frame.night
      if (!csm.camera) {
        // Not built yet: the first compile runs _init with these values.
        csm.maxFar = far
        return
      }
      if (key !== frustumKey) {
        frustumKey = key
        csm.maxFar = far
        csm.updateFrustums()
        tune(csm)
      } else if (!tuned || flags) {
        tune(csm)
      }
      dir.subVectors(light.target.position, light.position).normalize()
      const revision = frame.revision ?? ''
      if (dir.distanceToSquared(lastDir) > 1e-8 || revision !== lastRevision) {
        lastDir.copy(dir)
        lastRevision = revision
        forceFrames = Math.max(forceFrames, 2)
      }
      schedule(csm)
    },
    info() {
      const breaks = node?.breaks ?? []
      return { cascades, mapSize, far: far ?? 0, breaks: breaks.map((b) => b * (far ?? 0)), indoor }
    },
    dispose() {
      node?.dispose()
      node = null
      light.shadow.shadowNode = undefined as unknown as THREE.Node
    },
  }
}
