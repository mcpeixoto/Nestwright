import { describe, expect, it } from 'vitest'
import { pickSpills, SPILL_SLOTS } from '../../src/view3d/lighting/spillPool'
import { perfReport, recordFrame } from '../../src/view3d/perfMonitor'
import { createFrameCapture, createPerfStats, createSettleTracker, HITCH_MS } from '../../src/view3d/perfStats'
import { holdRendering, renderingHeld } from '../../src/view3d/render/hold'
import { BENCHMARK_TIER, runBenchmark, type BenchmarkHost } from '../../src/view3d/render/autoTier'

describe('hitch counting', () => {
  it('counts captured frames over the hitch threshold', () => {
    const capture = createFrameCapture()
    capture.start(4)
    for (const dt of [16, HITCH_MS + 1, 17, 400]) capture.push(dt)
    const timing = capture.timing()
    expect(timing.hitches).toBe(2)
    expect(timing.max).toBe(400)
  })

  it('counts slow frames in the rolling HUD window', () => {
    const stats = createPerfStats(10)
    for (const dt of [16, 60, 16, 70]) stats.push(dt)
    expect(stats.countAbove(HITCH_MS)).toBe(2)
    expect(stats.countAbove(100)).toBe(0)
  })
})

describe('settle tracker', () => {
  it('waits for quiet frames with a stable program count', () => {
    const settle = createSettleTracker(3)
    expect(settle.push(10, false)).toBe(false) // first sample sets the baseline
    expect(settle.push(10, false)).toBe(false)
    expect(settle.push(12, false)).toBe(false) // a compile resets the run
    expect(settle.push(12, false)).toBe(false)
    expect(settle.push(12, false)).toBe(false)
    expect(settle.push(12, false)).toBe(true)
    expect(settle.settled()).toBe(true)
    expect(settle.waited()).toBe(6)
  })

  it('does not count frames while rendering is held', () => {
    const settle = createSettleTracker(2)
    settle.push(5, false)
    settle.push(5, true)
    expect(settle.push(5, false)).toBe(false)
    expect(settle.push(5, false)).toBe(true)
  })

  it('gives up after the frame cap and says it did not settle', () => {
    const settle = createSettleTracker(3, 4)
    let done = false
    for (let i = 0; i < 4; i++) done = settle.push(i, false)
    expect(done).toBe(true)
    expect(settle.settled()).toBe(false)
  })

  it('needs no frames when the quiet count is zero', () => {
    expect(createSettleTracker(0).push(1, true)).toBe(true)
  })
})

describe('render hold', () => {
  it('nests and never goes negative', () => {
    holdRendering(true)
    holdRendering(true)
    holdRendering(false)
    expect(renderingHeld()).toBe(true)
    holdRendering(false)
    holdRendering(false)
    expect(renderingHeld()).toBe(false)
  })
})

function renderer(programs: number) {
  return {
    info: {
      render: { drawCalls: 7, triangles: 1 },
      memory: { geometries: 1, textures: 1, programs },
      reset() {},
    },
    domElement: { width: 10, height: 10 },
    getPixelRatio: () => 1,
  }
}
const scene = { traverse() {}, environment: null, background: null }

describe('settled perf report', () => {
  it('skips frames until the programs stop changing, then reports hitches', async () => {
    const pending = perfReport(3, { settle: 2 })
    recordFrame(renderer(1) as never, scene as never, 900) // compile frame
    recordFrame(renderer(2) as never, scene as never, 600)
    recordFrame(renderer(2) as never, scene as never, 16)
    recordFrame(renderer(2) as never, scene as never, 16) // settled here
    recordFrame(renderer(2) as never, scene as never, 16)
    recordFrame(renderer(2) as never, scene as never, 80)
    recordFrame(renderer(2) as never, scene as never, 16)
    const report = await pending
    expect(report.settled).toBe(true)
    expect(report.settleFrames).toBe(4)
    expect(report.max).toBe(80)
    expect(report.hitches).toBe(1)
    expect(report.newPrograms).toBe(0)
    expect(report.fpsAvg).toBeCloseTo(3000 / 112)
  })
})

describe('window spill pool', () => {
  const spills = [
    { x: 0, y: 1, z: 0 },
    { x: 10, y: 1, z: 0 },
    { x: 20, y: 1, z: 0 },
    { x: 30, y: 1, z: 0 },
    { x: 40, y: 1, z: 0 },
    { x: 50, y: 1, z: 0 },
  ]

  it('lights every spill when they fit', () => {
    expect(pickSpills(spills.slice(0, 3), { x: 0, y: 0, z: 0 })).toEqual([0, 1, 2])
  })

  it('keeps the slots nearest the camera, in spill order', () => {
    expect(SPILL_SLOTS).toBe(4)
    expect(pickSpills(spills, { x: 48, y: 1, z: 0 })).toEqual([2, 3, 4, 5])
    expect(pickSpills(spills, { x: 0, y: 1, z: 0 }, 2)).toEqual([0, 1])
  })

  it('handles no slots and bad points', () => {
    expect(pickSpills(spills, { x: 0, y: 0, z: 0 }, 0)).toEqual([])
    expect(pickSpills([{ x: Number.NaN, y: 0, z: 0 }, ...spills.slice(0, 4)], { x: 0, y: 0, z: 0 })).toEqual([1, 2, 3, 4])
  })
})

describe('benchmark prepare', () => {
  it('compiles the benchmark tier before the first frame', async () => {
    const order: string[] = []
    let clock = 0
    const host: BenchmarkHost = {
      prepare: async (tier) => {
        order.push(`prepare:${tier}`)
      },
      render: () => {
        order.push('render')
        clock += 10
      },
      finish: () => Promise.resolve(),
      now: () => clock,
      alive: () => true,
    }
    await runBenchmark(host)
    expect(order[0]).toBe(`prepare:${BENCHMARK_TIER}`)
    expect(order[1]).toBe('render')
  })
})
