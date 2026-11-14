import { describe, expect, it } from 'vitest'
import { perfReport, recordFrame } from '../../src/view3d/perfMonitor'

function renderer(calls: number) {
  return {
    info: {
      autoReset: false,
      render: { calls, triangles: 80, frame: 1, lines: 0, points: 0 },
      memory: { geometries: 4, textures: 2 },
      programs: [{}, {}, {}],
      reset() {
        this.render.calls = 0
      },
    },
    capabilities: { isWebGL2: true },
    domElement: { width: 2880, height: 1800 },
    getPixelRatio: () => 2,
  }
}

const scene = { traverse() {}, environment: null, background: null }

describe('perf report', () => {
  it('resolves after the requested rendered frames', async () => {
    const pending = perfReport(3)
    recordFrame(renderer(1) as never, scene as never, 16)
    recordFrame(renderer(2) as never, scene as never, 16)
    let settled = false
    void pending.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    recordFrame(renderer(11) as never, scene as never, 20)
    const report = await pending
    expect(report.backend).toBe('webgl2')
    expect(report.drawCalls).toBe(11)
    expect(report.triangles).toBe(80)
    expect(report.geometries).toBe(4)
    expect(report.textures).toBe(2)
    expect(report.programs).toBe(3)
    expect(report.width).toBe(2880)
    expect(report.height).toBe(1800)
    expect(report.pixelRatio).toBe(2)
    expect(report.quality).toBe('high')
    expect(report.fpsAvg).toBeCloseTo(3000 / 52)
    expect(report.max).toBe(20)
    expect(report.p50).toBeGreaterThan(0)
    expect(report.gpuMemMB).toBe(0)
  })

  it('rejects a report that a newer one replaces', async () => {
    const first = perfReport(30)
    const second = perfReport(1)
    await expect(first).rejects.toThrow(/superseded/)
    recordFrame(renderer(5) as never, scene as never, 16)
    const report = await second
    expect(report.drawCalls).toBe(5)
  })
})
