import { describe, expect, it } from 'vitest'
import { judgeSmoke, smokeDir, type RendererProbe } from '../../electron/smoke'

const probe = (over: Partial<RendererProbe> = {}): RendererProbe => ({
  ok: true,
  hasNavigatorGpu: false,
  webglRenderer: 'ANGLE (AMD Custom GPU 0405)',
  webglVendor: 'AMD',
  perf: { backend: 'webgl2', fpsAvg: 58, drawCalls: 120 },
  ...over,
})

describe('smoke mode', () => {
  it('reads the output dir from --smoke=', () => {
    expect(smokeDir(['electron', '.', '--smoke=/tmp/out'])).toBe('/tmp/out')
    expect(smokeDir(['electron', '.', '--smoke='])).toBeNull()
    expect(smokeDir(['electron', '.', '--capture=x.png'])).toBeNull()
  })

  it('passes only when the 3D view reported a backend and drew frames', () => {
    expect(judgeSmoke(probe())).toEqual({ ok: true, reasons: [] })
    expect(judgeSmoke(null).ok).toBe(false)
    expect(judgeSmoke(probe({ ok: false, error: 'loadTemplate(family) failed' })).reasons).toContain(
      'renderer error: loadTemplate(family) failed',
    )
    expect(judgeSmoke(probe({ perf: null })).reasons).toEqual(['no perf report'])
    expect(judgeSmoke(probe({ perf: { backend: 'webgl2', fpsAvg: 0 } })).reasons).toEqual(['3D view drew no frames'])
    expect(judgeSmoke(probe({ perf: { fpsAvg: 30 } })).reasons).toEqual(['no renderer backend reported'])
  })
})
