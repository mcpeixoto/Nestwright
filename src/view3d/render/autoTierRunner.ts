import type * as THREE from 'three'
import { showToast } from '../../achievements/toast'
import { fill, translate } from '../../i18n'
import { useSettings, type GraphicsQuality } from '../../settings'
import { runBenchmark, shouldBenchmark, type BenchmarkHost } from './autoTier'

/** What the runner needs from a SceneController (kept narrow so there is no import cycle). */
export interface AutoTierView {
  readonly canvas: HTMLCanvasElement
  renderer: THREE.WebGPURenderer | null
  isDisposed(): boolean
  /** Stop or resume the frame loop's own rendering while the benchmark owns the GPU. */
  setBenchmarking(on: boolean): void
  /** Render one frame on `tier`'s profile at the current canvas size. */
  benchmarkFrame(tier: GraphicsQuality): void
  /** Compile `tier`'s pipelines off the main thread before the timed frames. */
  prepareTier?(tier: GraphicsQuality): Promise<void>
}

const TIER_KEYS: Record<GraphicsQuality, string> = { low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra' }
const SETTLE_MS = 1500
const RETRY_MS = 1000
const MAX_TRIES = 20

let running = false
let watched: AutoTierView | null = null
let unsubscribe: (() => void) | null = null

/** Resolves when every command submitted so far has finished on the GPU. */
function gpuFinish(renderer: THREE.WebGPURenderer): () => Promise<void> {
  const backend = renderer.backend as {
    device?: { queue?: { onSubmittedWorkDone(): Promise<void> } }
    gl?: WebGL2RenderingContext
  }
  const queue = backend.device?.queue
  if (queue) return () => queue.onSubmittedWorkDone()
  const gl = backend.gl
  if (gl) {
    return () =>
      new Promise<void>((resolve) => {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
        gl.flush()
        if (!sync) {
          resolve()
          return
        }
        const poll = () => {
          const state = gl.clientWaitSync(sync, 0, 0)
          if (state === gl.TIMEOUT_EXPIRED) {
            setTimeout(poll, 0)
            return
          }
          gl.deleteSync(sync)
          resolve()
        }
        poll()
      })
  }
  return () => Promise.resolve()
}

function environment(): { webdriver: boolean; search: string } {
  const webdriver = typeof navigator !== 'undefined' && navigator.webdriver === true
  const search = typeof location === 'undefined' ? '' : location.search
  return { webdriver, search }
}

async function run(view: AutoTierView): Promise<void> {
  const renderer = view.renderer
  if (!renderer || running) return
  running = true
  const alive = () => !view.isDisposed() && useSettings.getState().qualityAuto
  const host: BenchmarkHost = {
    render: (tier) => view.benchmarkFrame(tier),
    finish: gpuFinish(renderer),
    now: () => performance.now(),
    alive,
    prepare: view.prepareTier ? (tier) => view.prepareTier?.(tier) ?? Promise.resolve() : undefined,
  }
  view.setBenchmarking(true)
  let result = null
  try {
    result = await runBenchmark(host)
  } catch (err) {
    console.warn('[nestwright] graphics benchmark failed', err)
  } finally {
    view.setBenchmarking(false)
    running = false
  }
  // The user may have picked a tier by hand meanwhile; that choice wins.
  if (!result || !alive()) return
  console.info(`[nestwright] graphics benchmark: ${result.medianMs.toFixed(2)} ms median over ${result.frames} frames → ${result.tier}`)
  const settings = useSettings.getState()
  settings.setSettings({ graphicsQuality: result.tier, qualityAuto: false })
  const language = settings.language
  showToast(fill(language, 'Graphics set to {tier}', { tier: translate(language, TIER_KEYS[result.tier]) }))
}

/** Wait for the view to settle and have a size, then benchmark once. */
function attempt(view: AutoTierView, tries = 0): void {
  setTimeout(() => {
    if (view.isDisposed() || watched !== view) return
    const env = environment()
    if (!shouldBenchmark(useSettings.getState().qualityAuto, env.webdriver, env.search)) return
    if (view.canvas.clientWidth < 2 || view.canvas.clientHeight < 2) {
      if (tries < MAX_TRIES) attempt(view, tries + 1)
      return
    }
    void run(view)
  }, tries === 0 ? SETTLE_MS : RETRY_MS)
}

/**
 * Called once the primary 3D view's renderer is up. Benchmarks if `qualityAuto` is on, and
 * again whenever the user switches it back on in Settings while this view is open.
 */
export function scheduleAutoTier(view: AutoTierView): void {
  watched = view
  if (!unsubscribe) {
    unsubscribe = useSettings.subscribe((next, prev) => {
      if (next.qualityAuto && !prev.qualityAuto && watched && !watched.isDisposed()) attempt(watched)
    })
  }
  attempt(view)
}
