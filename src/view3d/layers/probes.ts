import * as THREE from 'three'
import {
  levelProbeBox,
  probeCellCentre,
  probeIndexCoords,
  probeLevels,
  probeResolution,
  probeTier,
  probeWalls,
  relocateProbe,
  type ProbeResolution,
  type ProbeTierSettings,
} from '../../model/probeGrid'
import type { Level, Project } from '../../model/types'
import { useSettings } from '../../settings'
import { registerSceneLayer, type SceneViewState } from '../layers'
import { PROBE_LAYER, PROBES_PER_BATCH, ProbeBaker, ProbeVolume, type BakeJob } from '../lighting/probeVolume'
import { setPerfExtra, setSettleBusy } from '../perfMonitor'
import { rendererBackend } from '../render/createRenderer'
import { renderingHeld } from '../render/hold'

/**
 * Bounce light: one irradiance probe volume per level (a fixed pool of VOLUME_SLOTS, created
 * once per graphics tier), baked on the GPU a few probes per frame and rebaked after edits.
 * See lighting/probeVolume.ts for the volume itself and model/probeGrid.ts for the layout.
 */

/** Volumes in the scene at once: the active level and its nearest visible neighbour. */
export const VOLUME_SLOTS = 2
/** Share of the hemisphere and environment fill a baked volume replaces inside its box. */
export const PROBE_REPLACE = 0.85
/** Idle time after the last edit of a level before it rebakes. */
export const EDIT_DEBOUNCE_MS = 600
/** Time-of-day and weather changes rebake at most this often. */
export const ENV_THROTTLE_MS = 3000
/** Wait before a level's first bake (see reconcile). */
const FRESH_DELAY_MS = 1000
/** CPU ms a frame may spend on rebake captures; the probe count per frame is the other cap. */
const FRAME_BUDGET_MS = 5
/** The same for a first bake, which may cost frames while a project or level comes up. */
const FRESH_FRAME_BUDGET_MS = 12

type Reason = 'fresh' | 'env' | 'edit'

/**
 * Feedback passes per bake. Each adds a bounce on top of the last result; two also wash out
 * most of a stale result (night after day) within one rebake.
 */
const FEEDBACK_PASSES = 2

interface Slot {
  volume: ProbeVolume
  levelId: string | null
  /** Identity of the level parts that change its light (immer replaces them on edit). */
  parts: unknown[]
  env: string
  /** When a pending bake may start (ms, performance.now), or null when clean. */
  due: number | null
  reason: Reason
  baked: boolean
  lastStart: number
}

interface Job {
  slot: Slot
  bake: BakeJob
  total: number
  cursor: number
  /** Current pass; 0 captures with plain fill, later passes feed back the volumes. */
  pass: number
  firstPass: number
  /** Pass index the job ends at (exclusive). */
  passes: number
  started: number
  frames: number
  /** Bake-sun shadow needs one render at the first capture. */
  shadowDue: boolean
}

function envKey(project: Project): string {
  const env = project.environment
  if (!env) return ''
  const time = Math.round((env.time ?? 12) * 10) / 10
  return `${env.dayOfYear}|${time}|${env.latitude}|${env.north}|${env.weather}|${Math.round((env.cloudiness ?? 0) * 20)}|${env.autoLights ? 1 : 0}`
}

function levelParts(level: Level): unknown[] {
  return [level.walls, level.openings, level.items, level.rooms, level.roofs, level.elevation, level.height]
}

function sameParts(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i])
}

function levelShown(project: Project, state: SceneViewState, level: Level): boolean {
  const active = project.levels.find((entry) => entry.id === state.activeLevelId)
  const above = level.elevation > (active?.elevation ?? 0) + 1e-3
  if (state.levelDisplay !== 'all' && above) return false
  if (state.levelDisplay === 'current' && level.id !== state.activeLevelId) return false
  return true
}

type Caster = THREE.Light & { shadow: THREE.LightShadow }

const STRUCTURE_KINDS =new Set(['wall', 'opening', 'room', 'slab', 'roof', 'stair', 'column', 'terrain'])
const SKIPPED_NAMES = new Set(['clouds', 'stars', 'precip', 'rain', 'snow'])
const sphere = new THREE.Sphere()

/** Whether a probe capture draws this object (see PROBE_LAYER). Lights always. */
function seenByProbes(obj: THREE.Object3D): boolean {
  if ((obj as THREE.Light).isLight) return true
  const mesh = obj as THREE.Mesh
  if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return false
  if (SKIPPED_NAMES.has(mesh.name)) return false
  if (mesh.name === 'sky' || mesh.name === 'ground') return true
  const kind = mesh.userData.kind
  if (typeof kind === 'string' && STRUCTURE_KINDS.has(kind)) return true
  const geometry = mesh.geometry
  if (!geometry) return false
  if (!geometry.boundingSphere) geometry.computeBoundingSphere()
  if (!geometry.boundingSphere) return false
  sphere.copy(geometry.boundingSphere).applyMatrix4(mesh.matrixWorld)
  // Furniture big enough to shade or tint a wall; outdoor props only when large (a pool, a hedge row).
  return sphere.radius >= (kind === 'item' ? 0.35 : 1.5)
}

export interface ProbeStats {
  tier: string
  volumes: number
  baking: boolean
  /** A bake is running or waiting for its debounce. */
  pending: boolean
  bakes: number
  lastBakeMs: number
  lastBakeFrames: number
  maxStepMs: number
  /** Smoothed CPU ms of a bake step (one frame's captures). */
  avgStepMs: number
  probes: number[]
  /** Capture steps over 30 ms CPU (the first dozen). */
  slow: { ms: number; pass: number; cursor: number; frame: number; scene: number; project: number }[]
  /** ms of each capture precompile so far. */
  precompiles: number[]
}

const stats: ProbeStats = {
  tier: 'off',
  volumes: 0,
  baking: false,
  pending: false,
  bakes: 0,
  lastBakeMs: 0,
  lastBakeFrames: 0,
  maxStepMs: 0,
  avgStepMs: 0,
  probes: [],
  slow: [],
  precompiles: [],
}
setSettleBusy('probes', () => stats.pending)
setPerfExtra('probes',() => ({ ...stats, maxStepMs: Math.round(stats.maxStepMs * 10) / 10, lastBakeMs: Math.round(stats.lastBakeMs) }))

registerSceneLayer({
  id: 'probes',
  create(ctx) {
    const scene = ctx.scene
    const renderer = ctx.renderer
    // `?probes=off` compares against the plain fill. WebGL2 has no probe bake (the capture
    // needs WebGPU's array camera and 3D render targets as three drives them).
    const off = typeof location !== 'undefined' && new URLSearchParams(location.search).get('probes') === 'off'
    const enabled = !off && renderer != null && rendererBackend(renderer) === 'webgpu'
    let tier: ProbeTierSettings | null = null
    let tierName = ''
    let slots: Slot[] = []
    let baker: ProbeBaker | null = null
    let job: Job | null = null
    let project: Project | null = null
    let view: SceneViewState | null = null
    let covers: THREE.Object3D[] = []
    /** Shadow-casting scene lights, whose pending map refresh must wait for the main view. */
    let casters: Caster[] = []
    let coverFrame = 0

    // Stands in for the cascaded sun in captures: cascades are fitted to the view camera and
    // would leave other rooms unshadowed. Joins the scene only while a capture renders.
    const bakeSun = new THREE.DirectionalLight('#ffffff', 0)
    bakeSun.name = 'probe-bake-sun'
    bakeSun.castShadow = true
    // One size for every tier: probes see the room at 8–12 px a face, so a finer map buys
    // nothing, and resizing it would bump the light's shadow version and recompile captures.
    bakeSun.shadow.mapSize.set(1024, 1024)
    bakeSun.shadow.bias = -0.0006
    bakeSun.shadow.normalBias = 0.03
    bakeSun.shadow.autoUpdate = false
    bakeSun.userData.probeBake = true
    bakeSun.layers.enable(PROBE_LAYER)

    const clearSlots = () => {
      for (const slot of slots) {
        scene.remove(slot.volume)
        slot.volume.dispose()
      }
      slots = []
      job = null
      stats.pending = false
      stats.baking = false
    }

    const ensureTier = () => {
      const name = useSettings.getState().graphicsQuality
      if (name === tierName) return
      tierName = name
      tier = enabled ? probeTier(name) : null
      stats.tier = tier ? name : 'off'
      // A tier change rebuilds the post chain and recompiles anyway; this is the only time the
      // light count changes.
      clearSlots()
      if (!tier) {
        stats.volumes = 0
        return
      }
      for (let i = 0; i < VOLUME_SLOTS; i++) {
        const volume = new ProbeVolume(tier.perAxis)
        volume.name = `probe-volume-${i}`
        volume.userData.probeVolume = true
        volume.park()
        scene.add(volume)
        slots.push({ volume, levelId: null, parts: [], env: '', due: null, reason: 'fresh', baked: false, lastStart: -Infinity })
      }
      stats.volumes = slots.length
      if (!baker) baker = new ProbeBaker(tier.cubemapSize)
      else baker.setFaceSize(tier.cubemapSize)
    }

    /** Mark slots dirty from what changed since the last look. */
    const reconcile = (now: number) => {
      if (!project || !view || !tier) return
      const state = view
      const source = project
      const chosen = probeLevels(source.levels, state.activeLevelId, (level) => levelShown(source, state, level), slots.length)
      const env = envKey(source)
      slots.forEach((slot, i) => {
        const level = chosen[i]
        if (!level) {
          if (slot.levelId !== null) {
            if (job?.slot === slot) job = null
            slot.levelId = null
            slot.baked = false
            slot.due = null
            slot.volume.park()
          }
          return
        }
        const parts = levelParts(level)
        if (slot.levelId !== level.id) {
          if (job?.slot === slot) job = null
          slot.levelId = level.id
          slot.parts = parts
          slot.env = env
          slot.baked = false
          slot.reason = 'fresh'
          // A frame's grace: a project load starts its precompile (which also compiles the
          // capture pipelines) on the next frame, and the bake must not beat it to them.
          slot.due = now + FRESH_DELAY_MS
          // Until its bake lands the volume lights nothing: plain fill, as before probes.
          slot.volume.intensity = 0
          return
        }
        if (!sameParts(parts, slot.parts)) {
          slot.parts = parts
          slot.due = now + EDIT_DEBOUNCE_MS
          if (slot.reason !== 'fresh') slot.reason = 'edit'
        }
        if (env !== slot.env && !slot.baked) {
          // Nothing shown yet: restart the first bake with the new sky instead of waiting.
          slot.env = env
          if (job?.slot === slot) job = null
          slot.due = Math.max(now, slot.due ?? now)
        } else if (env !== slot.env) {
          slot.env = env
          const at = Math.max(now, slot.lastStart + ENV_THROTTLE_MS)
          slot.due = slot.due == null ? at : Math.max(slot.due, at)
          if (slot.reason !== 'fresh') slot.reason = 'env'
        }
      })
    }

    const startJob = (slot: Slot, now: number): Job | null => {
      if (!project || !tier || !slot.levelId) return null
      const level = project.levels.find((entry) => entry.id === slot.levelId)
      const box = level ? levelProbeBox(level) : null
      if (!level || !box) {
        slot.due = null
        slot.volume.park()
        return null
      }
      const res: ProbeResolution = probeResolution(box, tier.spacing, tier.maxProbes, slot.volume.capacity)
      const total = res.x * res.y * res.z
      const walls = probeWalls(level)
      const positions: THREE.Vector3[] = []
      for (let i = 0; i < total; i++) {
        const { ix, iy, iz } = probeIndexCoords(i, res)
        const p = relocateProbe(probeCellCentre(box, res, ix, iy, iz), walls)
        positions.push(new THREE.Vector3(p.x, p.y, p.z))
      }
      const atlas = slot.volume.atlas
      const world = new THREE.Box3(new THREE.Vector3(box.min.x, box.min.y, box.min.z), new THREE.Vector3(box.max.x, box.max.y, box.max.z))
      // A fresh bake starts with a plain-fill pass (pass 0); a rebake feeds back from its
      // last result straight away.
      const firstPass = slot.baked ? 1 : 0
      const passes = 1 + FEEDBACK_PASSES
      slot.due = null
      slot.lastStart = now
      return { slot, bake: { res, box: world, positions, atlas }, total, cursor: 0, pass: firstPass, firstPass, passes, started: now, frames: 0, shadowDue: true }
    }

    /** Ceilings and roofs (hidden by cutaways, shown to captures) and the capture layer. */
    const refreshCovers = () => {
      covers = []
      casters = []
      scene.traverse((obj) => {
        if (obj.userData.ceiling || obj.userData.roof) covers.push(obj)
        const light = obj as Caster
        if (light.isLight && light.castShadow && light.shadow) casters.push(light)
        if (seenByProbes(obj)) obj.layers.enable(PROBE_LAYER)
        else obj.layers.disable(PROBE_LAYER)
      })
    }

    const keySun = (): THREE.DirectionalLight | null => {
      const sun = scene.getObjectByName('sun') as THREE.DirectionalLight | undefined
      return sun?.isDirectionalLight ? sun : null
    }

    /** Put the scene in its capture state; returns the undo. */
    const enterCapture = (current: Job): (() => void) => {
      const sun = keySun()
      const sunVisible = sun?.visible ?? false
      // Shadow cameras copy the rendering camera's layers: a lamp-pool map due for a refresh
      // must be drawn by the main view, not by a capture that sees only PROBE_LAYER.
      const deferred: Caster[] = []
      for (const light of casters) {
        if (light !== (bakeSun as THREE.Light) && light.shadow.needsUpdate) {
          light.shadow.needsUpdate = false
          deferred.push(light)
        }
      }
      const hidden: THREE.Object3D[] = []
      for (const obj of covers) {
        if (!obj.visible) {
          obj.visible = true
          hidden.push(obj)
        }
      }
      if (sun) {
        sun.updateMatrixWorld()
        sun.target.updateMatrixWorld()
        const dir = new THREE.Vector3().setFromMatrixPosition(sun.matrixWorld).sub(new THREE.Vector3().setFromMatrixPosition(sun.target.matrixWorld))
        if (dir.lengthSq() < 1e-8) dir.set(0.3, 1, 0.2)
        dir.normalize()
        const sphere = current.bake.box.getBoundingSphere(new THREE.Sphere())
        const r = sphere.radius + 4
        bakeSun.color.copy(sun.color)
        bakeSun.intensity = sun.intensity
        bakeSun.target.position.copy(sphere.center)
        bakeSun.position.copy(sphere.center).addScaledVector(dir, r * 2)
        const cam = bakeSun.shadow.camera
        cam.left = -r
        cam.right = r
        cam.top = r
        cam.bottom = -r
        cam.near = 0.5
        cam.far = r * 4
        cam.updateProjectionMatrix()
        sun.visible = false
      } else {
        bakeSun.intensity = 0
      }
      scene.add(bakeSun)
      scene.add(bakeSun.target)
      bakeSun.updateMatrixWorld()
      bakeSun.target.updateMatrixWorld()
      if (current.shadowDue) {
        bakeSun.shadow.needsUpdate = true
        current.shadowDue = false
      }
      // A first pass captures with the plain fill (no probe light at all); later passes see
      // the volumes' last result, one more bounce each.
      const saved = slots.map((slot) => ({ volume: slot.volume, intensity: slot.volume.intensity, replace: slot.volume.replace }))
      if (current.pass === 0) for (const slot of slots) slot.volume.intensity = 0
      return () => {
        for (const entry of saved) {
          entry.volume.intensity = entry.intensity
          entry.volume.replace = entry.replace
        }
        scene.remove(bakeSun)
        scene.remove(bakeSun.target)
        if (sun) sun.visible = sunVisible
        for (const obj of hidden) obj.visible = false
        for (const light of deferred) light.shadow.needsUpdate = true
      }
    }

    const finishPass = (current: Job) => {
      if (!renderer || !baker) return
      const slot = current.slot
      baker.pack(renderer, current.bake, slot.volume.capacity)
      slot.volume.install(current.bake.res, current.bake.box)
      slot.volume.intensity = 1
      slot.volume.replace = PROBE_REPLACE
      slot.baked = true
      stats.probes[slots.indexOf(slot)] = current.total
    }

    const step = (now: number) => {
      if (!renderer || !baker || !tier) return
      if (!job) {
        const next = slots.find((slot) => slot.due != null && slot.due <= now && slot.levelId)
        if (!next) {
          stats.baking = false
          return
        }
        job = startJob(next, now)
        if (!job) return
      }
      const current = job
      stats.baking = true
      current.frames += 1
      const t0 = performance.now()
      const undo = enterCapture(current)
      try {
        // The first frames of a bake after the scene was rebuilt set up a render object per
        // mesh a capture sees. Ramping the probes per frame (1, 2, 4, then full batches)
        // spreads that over several frames, each probe seeing one room.
        const perFrame = current.firstPass === 0 ? tier.freshProbesPerFrame : tier.probesPerFrame
        const ramp = current.frames <= 4 && current.pass === current.firstPass ? 1 << (current.frames - 1) : perFrame
        let budget = Math.min(perFrame, ramp)
        while (budget > 0 && current.cursor < current.total) {
          const done = baker.capture(renderer, scene, current.bake, current.cursor, Math.min(PROBES_PER_BATCH, budget))
          if (done <= 0) break
          current.cursor += done
          budget -= done
          if (performance.now() - t0 > (current.firstPass === 0 ? FRESH_FRAME_BUDGET_MS : FRAME_BUDGET_MS)) break
        }
      } finally {
        undo()
      }
      if (current.cursor >= current.total) {
        finishPass(current)
        current.pass += 1
        current.cursor = 0
        if (current.pass >= current.passes) {
          stats.bakes += 1
          stats.lastBakeMs = performance.now() - current.started
          stats.lastBakeFrames = current.frames
          job = null
        }
      }
      const spent = performance.now() - t0
      stats.maxStepMs = Math.max(stats.maxStepMs, spent)
      stats.avgStepMs = stats.avgStepMs > 0 ? stats.avgStepMs * 0.95 + spent * 0.05 : spent
      if (spent > 30 && stats.slow.length < 12) {
        stats.slow.push({
          ms: Math.round(spent),
          pass: current.pass,
          cursor: current.cursor,
          frame: current.frames,
          scene: Math.round(baker.timing.scene),
          project: Math.round(baker.timing.project),
        })
      }
    }

    return {
      sync(next, state) {
        project = next
        view = state
        refreshCovers()
      },
      update() {
        if (!enabled || !project || !view || renderingHeld()) return
        try {
          ensureTier()
          if (!tier) return
          if (coverFrame++ % 60 === 0) refreshCovers()
          const now = performance.now()
          reconcile(now)
          step(now)
          stats.pending = job != null || slots.some((slot) => slot.due != null && slot.levelId != null)
        } catch (err) {
          console.error('[nestwright] probe bake failed', err)
          job = null
        }
      },
      /**
       * Compile the capture pipelines (scene materials under the capture light set, rendered by
       * the capture camera into the face target) during the load precompile, so the first bake
       * does not compile them inside a frame.
       */
      async precompile() {
        if (!enabled || !renderer || !project || !view) return
        ensureTier()
        if (!tier || !baker || slots.length === 0) return
        const level = project.levels[0]
        const box = level ? levelProbeBox(level) : null
        const centre = box
          ? new THREE.Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2)
          : new THREE.Vector3(0, 1.2, 0)
        const world = new THREE.Box3().setFromCenterAndSize(centre, new THREE.Vector3(8, 3, 8))
        const fake: Job = {
          slot: slots[0] as Slot,
          bake: { res: { x: 2, y: 2, z: 2 }, box: world, positions: new Array(PROBES_PER_BATCH).fill(centre), atlas: slots[0]!.volume.atlas },
          total: PROBES_PER_BATCH,
          cursor: 0,
          pass: 1,
          firstPass: 1,
          passes: 2,
          started: 0,
          frames: 0,
          shadowDue: false,
        }
        refreshCovers()
        baker.aim(fake.bake.positions, 0, PROBES_PER_BATCH)
        const undo = enterCapture(fake)
        const culled: THREE.Object3D[] = []
        scene.traverse((obj) => {
          if (obj.frustumCulled) {
            obj.frustumCulled = false
            culled.push(obj)
          }
        })
        const previous = renderer.getRenderTarget()
        const t0 = performance.now()
        try {
          renderer.setRenderTarget(baker.target)
          // compileAsync against a target that has never been rendered builds pipelines for
          // the wrong formats (invalid, "structures must have at least one member"); one
          // empty render sets the target up first (see PostPipeline.precompile).
          const mask = baker.camera.layers.mask
          baker.camera.layers.set(31)
          try {
            renderer.render(scene, baker.camera)
          } finally {
            baker.camera.layers.mask = mask
          }
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
          renderer.setRenderTarget(baker.target)
          await renderer.compileAsync(scene, baker.camera)
        } catch (err) {
          console.warn('[nestwright] probe precompile failed', err)
        } finally {
          renderer.setRenderTarget(previous)
          for (const obj of culled) obj.frustumCulled = true
          undo()
        }
        stats.precompiles.push(Math.round(performance.now() - t0))
      },
      dispose() {
        clearSlots()
        baker?.dispose()
        baker = null
        bakeSun.dispose()
        stats.volumes = 0
      },
    }
  },
})
