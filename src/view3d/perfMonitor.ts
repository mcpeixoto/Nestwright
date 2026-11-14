import { useSettings } from '../settings'
import { renderingHeld } from './render/hold'
import { estimateGpuBytes, type GpuScene } from './gpuEstimate'
import { createFrameCapture, createSettleTracker, frameStats, HITCH_MS, type CaptureTiming, type SettleTracker } from './perfStats'

export interface PerfReport {
  backend: string
  width: number
  height: number
  pixelRatio: number
  quality: string
  fpsAvg: number
  p50: number
  p95: number
  max: number
  /** Captured frames longer than HITCH_MS (50 ms). */
  hitches: number
  /** Frames waited for the scene to settle (no new programs, no precompile) before capturing. */
  settleFrames: number
  /** False when the settle wait gave up: the capture may include compile stalls. */
  settled: boolean
  /** GPU programs created during the capture; anything above 0 is a compile inside the window. */
  newPrograms: number
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  programs: number
  gpuMemMB: number
  jsHeapMB?: number
}

export interface PerfReportOptions {
  /**
   * Quiet frames (no new GPU program, no precompile running) required before the capture
   * starts. 0 measures from the next frame.
   */
  settle?: number
}

export interface PerfHudSnapshot {
  fps: number
  p50: number
  p95: number
  /** Longest frame and frames over 50 ms in the HUD window (last 300 frames). */
  max: number
  hitches: number
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  programs: number
  gpuMemMB: number
  backend: string
  width: number
  height: number
  pixelRatio: number
  quality: string
}

const latest = {
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  programs: 0,
  gpuMemMB: 0,
  backend: 'webgl',
  width: 0,
  height: 0,
  pixelRatio: 1,
}

const capture = createFrameCapture()
let gpuTick = 0
interface PendingReport {
  resolve: (report: PerfReport) => void
  reject: (error: Error) => void
  frames: number
  settle: SettleTracker
  capturing: boolean
  programsAtStart: number
}
let pending: PendingReport | null = null

function jsHeapMB(): number | undefined {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory
  const bytes = memory?.usedJSHeapSize
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return undefined
  return bytes / (1024 * 1024)
}

function buildReport(timing: CaptureTiming, waiter: PendingReport): PerfReport {
  const report: PerfReport = {
    backend: latest.backend,
    width: latest.width,
    height: latest.height,
    pixelRatio: latest.pixelRatio,
    quality: useSettings.getState().graphicsQuality,
    fpsAvg: timing.fpsAvg,
    p50: timing.p50,
    p95: timing.p95,
    max: timing.max,
    hitches: timing.hitches,
    settleFrames: waiter.settle.waited(),
    settled: waiter.settle.settled(),
    newPrograms: Math.max(0, latest.programs - waiter.programsAtStart),
    drawCalls: latest.drawCalls,
    triangles: latest.triangles,
    geometries: latest.geometries,
    textures: latest.textures,
    programs: latest.programs,
    gpuMemMB: latest.gpuMemMB,
  }
  const heap = jsHeapMB()
  if (heap != null) report.jsHeapMB = heap
  return report
}

/**
 * The parts of renderer.info both renderers share. WebGPURenderer counts draws in
 * `render.drawCalls` (its `render.calls` is render() invocations), pipelines in
 * `memory.programs` and real allocations in `memory.total`; WebGLRenderer has
 * `render.calls`, a `programs` array and no byte totals.
 */
export interface PerfRenderer {
  info: {
    render: { calls?: number; drawCalls?: number; triangles: number }
    memory: { geometries: number; textures: number; programs?: number; total?: number }
    programs?: unknown[] | null
    reset(): void
  }
  backend?: { isWebGPUBackend?: boolean; isWebGLBackend?: boolean }
  capabilities?: { isWebGL2?: boolean }
  domElement: { width: number; height: number }
  getPixelRatio(): number
}

function backendName(renderer: PerfRenderer): string {
  if (renderer.backend?.isWebGPUBackend) return 'webgpu'
  if (renderer.backend?.isWebGLBackend) return 'webgl2'
  return renderer.capabilities?.isWebGL2 ? 'webgl2' : 'webgl'
}

/** Snapshot renderer.info after a completed frame, then reset it. Primary view only. */
export function recordFrame(renderer: PerfRenderer, scene: GpuScene, dtMs: number, backend?: string): void {
  if (!Number.isFinite(dtMs) || dtMs < 0) return
  frameStats.push(dtMs)
  const info = renderer.info
  latest.drawCalls = info.render.drawCalls ?? info.render.calls ?? 0
  latest.triangles = info.render.triangles
  latest.geometries = info.memory.geometries
  latest.textures = info.memory.textures
  latest.programs = typeof info.memory.programs === 'number' ? info.memory.programs : (info.programs?.length ?? 0)
  latest.backend = backend ?? backendName(renderer)
  latest.width = renderer.domElement.width
  latest.height = renderer.domElement.height
  latest.pixelRatio = renderer.getPixelRatio()
  let finishing = false
  if (pending && !pending.capturing && pending.settle.push(latest.programs, renderingHeld())) {
    pending.capturing = true
    pending.programsAtStart = latest.programs
    capture.start(pending.frames)
  } else if (pending?.capturing) {
    finishing = capture.push(dtMs)
  }
  gpuTick += 1
  // The walk is not free. Do it on the sample that closes a report (its cost
  // lands on the next frame, outside the captured window) and, while the HUD
  // is up, about four times a second.
  const hud = useSettings.getState().showFps
  const tracked = info.memory.total
  if (typeof tracked === 'number' && tracked > 0) {
    // WebGPURenderer tracks its own buffers and textures (render targets included).
    latest.gpuMemMB = tracked / (1024 * 1024)
  } else if (finishing || (hud && (gpuTick === 1 || gpuTick % 15 === 0))) {
    latest.gpuMemMB = estimateGpuBytes(scene) / (1024 * 1024)
  }
  info.reset()
  if (!finishing || !pending) return
  const waiter = pending
  pending = null
  waiter.resolve(buildReport(capture.timing(), waiter))
}

/**
 * Wait until the scene has settled (`options.settle` quiet frames, default 0), then record
 * `frames` rendered frames (default 120) and resolve.
 */
export function perfReport(frames?: number, options: PerfReportOptions = {}): Promise<PerfReport> {
  const raw = frames == null || !Number.isFinite(frames) ? 120 : Math.floor(frames)
  const count = Math.max(1, Math.min(4096, raw))
  const settle = options.settle != null && Number.isFinite(options.settle) ? Math.max(0, Math.floor(options.settle)) : 0
  if (pending) pending.reject(new Error('perf report superseded'))
  return new Promise((resolve, reject) => {
    const tracker = createSettleTracker(settle)
    pending = { resolve, reject, frames: count, settle: tracker, capturing: false, programsAtStart: latest.programs }
    if (settle === 0) {
      pending.capturing = true
      capture.start(count)
    }
  })
}

export function readPerfHud(): PerfHudSnapshot {
  return {
    fps: frameStats.fps(),
    p50: frameStats.percentile(50),
    p95: frameStats.percentile(95),
    max: frameStats.max(),
    hitches: frameStats.countAbove(HITCH_MS),
    drawCalls: latest.drawCalls,
    triangles: latest.triangles,
    geometries: latest.geometries,
    textures: latest.textures,
    programs: latest.programs,
    gpuMemMB: latest.gpuMemMB,
    backend: latest.backend,
    width: latest.width,
    height: latest.height,
    pixelRatio: latest.pixelRatio,
    quality: useSettings.getState().graphicsQuality,
  }
}
