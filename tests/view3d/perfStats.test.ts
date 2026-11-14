import { describe, expect, it } from 'vitest'
import { createFrameCapture, createPerfStats } from '../../src/view3d/perfStats'

describe('perf stats', () => {
  it('reports about 60 fps from a second of 16.7 ms frames', () => {
    const stats = createPerfStats()
    for (let i = 0; i < 60; i++) stats.push(1000 / 60)
    expect(stats.fps()).toBeCloseTo(60, 1)
    expect(stats.count()).toBe(60)
  })

  it('keeps the one-second window and drops older frames', () => {
    const stats = createPerfStats()
    for (let i = 0; i < 100; i++) stats.push(50)
    for (let i = 0; i < 30; i++) stats.push(10)
    expect(stats.fps()).toBeCloseTo(44, 5)
  })

  it('interpolates percentiles over the retained samples', () => {
    const stats = createPerfStats()
    for (const value of [1, 2, 3, 4, 5]) stats.push(value)
    expect(stats.percentile(50)).toBeCloseTo(3)
    expect(stats.percentile(95)).toBeCloseTo(4.8)
    expect(stats.max()).toBe(5)
    expect(stats.percentile(0)).toBe(1)
    expect(stats.percentile(100)).toBe(5)
  })

  it('keeps only the last N samples and ignores bad deltas', () => {
    const stats = createPerfStats(300)
    stats.push(Number.NaN)
    stats.push(-1)
    for (let value = 1; value <= 1000; value++) stats.push(value)
    expect(stats.count()).toBe(300)
    expect(stats.percentile(0)).toBe(701)
    expect(stats.percentile(100)).toBe(1000)
    expect(stats.max()).toBe(1000)
    stats.reset()
    expect(stats.count()).toBe(0)
    expect(stats.fps()).toBe(0)
    expect(stats.percentile(50)).toBe(0)
  })

  it('averages a captured run separately from the rolling window', () => {
    const capture = createFrameCapture()
    expect(capture.push(10)).toBe(false)
    capture.start(4)
    expect(capture.push(10)).toBe(false)
    expect(capture.push(20)).toBe(false)
    expect(capture.push(30)).toBe(false)
    expect(capture.push(40)).toBe(true)
    expect(capture.push(99)).toBe(false)
    const timing = capture.timing()
    expect(timing.fpsAvg).toBeCloseTo(40)
    expect(timing.p50).toBeCloseTo(25)
    expect(timing.max).toBe(40)
  })
})
