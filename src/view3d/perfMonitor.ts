import * as THREE from 'three'
import { useSettings } from '../settings'
import { estimateGpuBytes, type GpuScene } from './gpuEstimate'
import { createFrameCapture, frameStats, type CaptureTiming } from './perfStats'

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
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  programs: number
  gpuMemMB: number
  jsHeapMB?: number
}

export interface PerfHudSnapshot {
  fps: number
  p50: number
  p95: number
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
let pending: { resolve: (report: PerfReport) => void; reject: (error: Error) => void } | null = null

function jsHeapMB(): number | undefined {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory
  const bytes = memory?.usedJSHeapSize
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return undefined
  return bytes / (1024 * 1024)
}

function buildReport(timing: CaptureTiming): PerfReport {
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

/** Snapshot renderer.info after a completed frame, then reset it. Primary view only. */
export function recordFrame(renderer: THREE.WebGLRenderer, scene: GpuScene, dtMs: number): void {
  if (!Number.isFinite(dtMs) || dtMs < 0) return
  frameStats.push(dtMs)
  const info = renderer.info
  latest.drawCalls = info.render.calls
  latest.triangles = info.render.triangles
  latest.geometries = info.memory.geometries
  latest.textures = info.memory.textures
  latest.programs = info.programs?.length ?? 0
  latest.backend = renderer.capabilities.isWebGL2 ? 'webgl2' : 'webgl'
  latest.width = renderer.domElement.width
  latest.height = renderer.domElement.height
  latest.pixelRatio = renderer.getPixelRatio()
  const finishing = capture.push(dtMs)
  gpuTick += 1
  // The walk is not free. Do it on the sample that closes a report (its cost
  // lands on the next frame, outside the captured window) and, while the HUD
  // is up, about four times a second.
  const hud = useSettings.getState().showFps
  if (finishing || (hud && (gpuTick === 1 || gpuTick % 15 === 0))) {
    latest.gpuMemMB = estimateGpuBytes(scene) / (1024 * 1024)
  }
  info.reset()
  if (!finishing || !pending) return
  const waiter = pending
  pending = null
  waiter.resolve(buildReport(capture.timing()))
}

/** Wait until `frames` rendered frames (default 120) have been recorded, then resolve. */
export function perfReport(frames?: number): Promise<PerfReport> {
  const raw = frames == null || !Number.isFinite(frames) ? 120 : Math.floor(frames)
  const count = Math.max(1, Math.min(4096, raw))
  if (pending) pending.reject(new Error('perf report superseded'))
  return new Promise((resolve, reject) => {
    pending = { resolve, reject }
    capture.start(count)
  })
}

export function readPerfHud(): PerfHudSnapshot {
  return {
    fps: frameStats.fps(),
    p50: frameStats.percentile(50),
    p95: frameStats.percentile(95),
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
