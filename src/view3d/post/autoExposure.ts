import * as THREE from 'three'
import { float, Fn, log2, luminance, max, texture, uv, vec2, vec4 } from 'three/tsl'
import { adaptEv, evGain, meterAverage, targetEv } from '../../model/exposure'
import { setPerfExtra, setSettleBusy } from '../perfMonitor'

/** Meter target size: ~2300 samples, a 37 KB readback. */
const METER_W = 64
const METER_H = 36
/** Frames between meter reads; one read is in flight at a time. */
const METER_EVERY = 3
/** A meter older than this (ms) no longer steers the exposure (no frames, e.g. a held view). */
const METER_STALE_MS = 2000

interface MeterReading {
  log2: number
  at: number
}

let latest: MeterReading | null = null

/**
 * Average log2 luminance of the HDR scene colour (before AO, bloom and tone mapping), on a
 * small target drawn in TSL and read back asynchronously. The readback lands a frame or two
 * late, which the adaptation smoothing hides.
 */
export class ExposureMeter {
  private readonly target = new THREE.RenderTarget(METER_W, METER_H, {
    type: THREE.FloatType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    generateMipmaps: false,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  })
  private readonly source = texture(new THREE.Texture())
  private readonly quad: THREE.QuadMesh
  private readonly material: THREE.NodeMaterial
  private frame = 0
  private pending = false
  private disposed = false

  constructor() {
    const src = this.source
    // Four taps per meter texel across its footprint, so a small bright window is counted
    // whatever the TRAA jitter, instead of hit or missed by a single sample.
    const meter = Fn(() => {
      const at = uv()
      const step = vec2(0.25 / METER_W, 0.25 / METER_H)
      const sum = float(0).toVar()
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const) {
        const rgb = src.sample(at.add(step.mul(vec2(dx, dy)))).rgb
        sum.addAssign(log2(max(luminance(rgb), float(1 / 16384))))
      }
      return vec4(sum.mul(0.25), 0, 0, 1)
    })
    this.material = new THREE.NodeMaterial()
    this.material.outputNode = meter()
    this.material.depthTest = false
    this.material.depthWrite = false
    this.quad = new THREE.QuadMesh(this.material)
  }

  /** Meter `color` (the scene pass's HDR output) every few frames. */
  run(renderer: THREE.WebGPURenderer, color: THREE.Texture | null): void {
    if (!color || this.disposed) return
    if (this.frame++ % METER_EVERY !== 0 || this.pending) return
    this.source.value = color
    const previous = renderer.getRenderTarget()
    renderer.setRenderTarget(this.target)
    this.quad.render(renderer)
    renderer.setRenderTarget(previous)
    this.pending = true
    void renderer
      .readRenderTargetPixelsAsync(this.target, 0, 0, METER_W, METER_H)
      .then((data) => {
        if (this.disposed) return
        const average = meterAverage(data as ArrayLike<number>, METER_W, METER_H, 4)
        if (average != null) latest = { log2: average, at: performance.now() }
      })
      .catch(() => {
        /* a lost readback is the next one's job */
      })
      .finally(() => {
        this.pending = false
      })
  }

  dispose(): void {
    this.disposed = true
    this.target.dispose()
    this.material.dispose()
  }
}

/** The latest metered average, or null when none is fresh. */
export function meteredLog2(now = performance.now()): number | null {
  if (!latest || now - latest.at > METER_STALE_MS) return null
  return latest.log2
}

export interface AutoExposureState {
  /** Current (smoothed) EV correction. */
  ev: number
  /** What the last meter asked for. */
  target: number
  /** 0 outside … 1 in a room, smoothed. */
  indoor: number
  /** Metered log2 luminance, or null. */
  meter: number | null
}

const state: AutoExposureState = { ev: 0, target: 0, indoor: 0, meter: null }
setSettleBusy('exposure', () => state.meter != null && Math.abs(state.ev - state.target) > 0.02)
setPerfExtra('exposure', () => ({
  ev: Math.round(state.ev * 100) / 100,
  target: Math.round(state.target * 100) / 100,
  indoor: Math.round(state.indoor * 100) / 100,
  meter: state.meter == null ? null : Math.round(state.meter * 100) / 100,
}))

export function autoExposureState(): Readonly<AutoExposureState> {
  return state
}

/** Settle in a fraction of the time under automation, so captures do not catch it mid-adapt. */
function adaptSpeed(): number {
  try {
    return typeof navigator !== 'undefined' && navigator.webdriver === true ? 8 : 1
  } catch {
    return 1
  }
}

/**
 * Advance the exposure by `dt` seconds and return the multiplier on `base` (the sun look's
 * exposure) including manual compensation. `indoor` is whether the camera stands in a room.
 */
export function stepAutoExposure(dt: number, base: number, indoor: boolean, compensation: number, daylight = 1): number {
  const speed = adaptSpeed()
  // Indoor/outdoor crossfades over ~0.4 s, so a door step does not jump the range.
  const k = dt > 0 ? 1 - Math.exp((-dt * speed) / 0.4) : 0
  state.indoor += ((indoor ? 1 : 0) - state.indoor) * k
  state.meter = meteredLog2()
  if (state.meter != null) state.target = targetEv(state.meter, base, state.indoor, daylight)
  state.ev = adaptEv(state.ev, state.target, dt, speed)
  return evGain(state.ev, compensation)
}
