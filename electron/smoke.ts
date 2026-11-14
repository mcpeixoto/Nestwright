// `--smoke=<dir>`: open a template in 3D, let it render, then write smoke.png and smoke.json
// (renderer backend, GPU info, a perf sample) into <dir> and quit. Exit code 0 means the 3D
// view drew frames. Used by scripts/deck/smoke.sh on the Steam Deck, and works on any OS.

export const SMOKE_TIMEOUT_MS = 120_000

export function smokeDir(argv: readonly string[]): string | null {
  const arg = argv.find((a) => a.startsWith('--smoke='))
  if (!arg) return null
  const dir = arg.slice('--smoke='.length).trim()
  return dir.length > 0 ? dir : null
}

export interface RendererProbe {
  ok: boolean
  error?: string
  hasNavigatorGpu: boolean
  webglRenderer: string | null
  webglVendor: string | null
  perf: { backend?: string; fpsAvg?: number; drawCalls?: number; triangles?: number; width?: number; height?: number } | null
}

export interface SmokeReport {
  ok: boolean
  reasons: string[]
  platform: string
  arch: string
  versions: { electron: string; chrome: string; app: string }
  gpuFeatureStatus: unknown
  gpuInfo: unknown
  renderer: RendererProbe | null
  elapsedMs: number
}

/** The smoke passes only when the page answered and the 3D view drew at least one frame. */
export function judgeSmoke(probe: RendererProbe | null): { ok: boolean; reasons: string[] } {
  const reasons: string[] = []
  if (!probe) reasons.push('renderer did not answer')
  else {
    if (!probe.ok) reasons.push(`renderer error: ${probe.error ?? 'unknown'}`)
    if (!probe.perf) reasons.push('no perf report')
    else {
      if (!probe.perf.backend) reasons.push('no renderer backend reported')
      if (!(typeof probe.perf.fpsAvg === 'number' && probe.perf.fpsAvg > 0)) reasons.push('3D view drew no frames')
    }
  }
  return { ok: reasons.length === 0, reasons }
}

/**
 * Runs inside the page. Kept as a string so the main bundle does not pull in renderer code.
 * It drives the same debug hooks as scripts/visual/shoot.mjs.
 */
export const RENDERER_PROBE = `(async () => {
  const out = { ok: false, hasNavigatorGpu: typeof navigator.gpu !== 'undefined', webglRenderer: null, webglVendor: null, perf: null }
  try {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl')
    const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info')
    if (gl && dbg) {
      out.webglRenderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
      out.webglVendor = String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL))
    }
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    for (let i = 0; i < 100 && typeof window.__nestwright?.loadTemplate !== 'function'; i++) await wait(100)
    const nw = window.__nestwright
    if (!nw || !nw.loadTemplate('family')) throw new Error('loadTemplate(family) failed')
    await wait(500)
    document.querySelector('.tour-card button')?.click()
    nw.useStore.getState().setView('3d')
    await wait(6000)
    out.perf = await nw.perf.report(120)
    out.ok = true
  } catch (err) {
    out.error = String(err && err.message ? err.message : err)
  }
  return out
})()`
