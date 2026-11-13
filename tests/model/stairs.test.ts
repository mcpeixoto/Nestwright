import { describe, expect, it } from 'vitest'
import { areasOverlap } from '../../src/model/polygon'
import { computeStairSteps, stairHeightAt, stairHoleOutline } from '../../src/model/stairs'
import type { Stair, Vec2 } from '../../src/model/types'

function stair(partial: Partial<Stair> = {}): Stair {
  return {
    id: 'stair_test',
    shape: 'straight',
    position: { x: 0, y: 0 },
    rotation: 0,
    width: 1,
    rise: 2.7,
    material: { id: 'oak-planks' },
    railing: true,
    ...partial,
  }
}

function noOverlap(polys: Vec2[][]) {
  for (let i = 0; i < polys.length; i++) {
    for (let j = i + 1; j < polys.length; j++) {
      const a = polys[i]
      const b = polys[j]
      if (a && b) expect(areasOverlap(a, b)).toBe(false)
    }
  }
}

describe('computeStairSteps', () => {
  it('uses a 0.18 m riser and a 0.27 m going for a 2.7 m rise', () => {
    const layout = computeStairSteps(stair(), 2.7)
    expect(layout.count).toBe(15)
    expect(layout.riser).toBeCloseTo(0.18, 6)
    expect(layout.going).toBeCloseTo(0.27, 6)
    expect(layout.riser).toBeLessThanOrEqual(0.19)
    expect(layout.steps).toHaveLength(15)
    expect(layout.steps[layout.steps.length - 1]?.height).toBeCloseTo(2.7, 6)
    expect(layout.rise).toBeCloseTo(2.7, 6)
    noOverlap(layout.steps.map((step) => step.polygon))
  })

  it('keeps the riser under 0.19 m and the total rise exact for an awkward height', () => {
    const layout = computeStairSteps(stair({ rise: 2.8 }), 2.7)
    expect(layout.riser).toBeLessThanOrEqual(0.19 + 1e-9)
    expect(layout.count * layout.riser).toBeCloseTo(2.8, 6)
    expect(layout.steps.at(-1)?.height).toBeCloseTo(2.8, 6)
    expect(Math.abs(2 * layout.riser + layout.going - 0.63)).toBeLessThan(1e-9)
  })

  it('falls back to the level height when rise is unset', () => {
    const layout = computeStairSteps(stair({ rise: 0 }), 3)
    expect(layout.rise).toBeCloseTo(3, 6)
    expect(layout.steps.at(-1)?.height).toBeCloseTo(3, 6)
  })

  it('puts a landing on an L and a U, with no overlapping treads', () => {
    for (const shape of ['l-shape', 'u-shape'] as const) {
      for (const turnLeft of [true, false]) {
        const layout = computeStairSteps(stair({ shape, turnLeft }), 2.7)
        expect(layout.steps.some((step) => step.landing)).toBe(true)
        expect(layout.steps.at(-1)?.height).toBeCloseTo(2.7, 5)
        noOverlap(layout.steps.map((step) => step.polygon))
      }
    }
  })

  it('winds a spiral between 270° and 360° around a 0.15 m core', () => {
    const layout = computeStairSteps(stair({ shape: 'spiral', width: 0.9 }), 2.7)
    expect(layout.steps.at(-1)?.height).toBeCloseTo(2.7, 5)
    noOverlap(layout.steps.map((step) => step.polygon))
    const centre = { x: 0, y: 0 }
    let minR = Infinity
    let maxAngle = 0
    for (const step of layout.steps) {
      for (const p of step.polygon) {
        minR = Math.min(minR, Math.hypot(p.x - centre.x, p.y - centre.y))
      }
    }
    const last = layout.steps.at(-1)?.polygon[0]
    const first = layout.steps[0]?.polygon[0]
    if (first && last) {
      const a0 = Math.atan2(first.y, first.x)
      const a1 = Math.atan2(last.y, last.x)
      let sweep = a1 - a0
      if (sweep < 0) sweep += Math.PI * 2
      maxAngle = sweep
    }
    expect(minR).toBeCloseTo(0.15, 2)
    expect(maxAngle).toBeGreaterThanOrEqual(Math.PI * 1.5 - 0.15)
    expect(maxAngle).toBeLessThanOrEqual(Math.PI * 2 + 0.05)
  })
})

describe('stairHeightAt', () => {
  it('returns the tread height inside a step and null outside', () => {
    const item = stair()
    const layout = computeStairSteps(item, 2.7)
    const first = layout.steps[0]
    expect(first).toBeTruthy()
    const mid = centroid(first!.polygon)
    expect(stairHeightAt(item, mid)).toBeCloseTo(first!.height, 5)
    expect(stairHeightAt(item, { x: 10, y: 10 })).toBeNull()
  })

  it('reads the landing height on an L', () => {
    const item = stair({ shape: 'l-shape', turnLeft: true })
    const layout = computeStairSteps(item, 2.7)
    const landing = layout.steps.find((step) => step.landing)
    expect(landing).toBeTruthy()
    expect(stairHeightAt(item, centroid(landing!.polygon))).toBeCloseTo(landing!.height, 5)
  })
})

describe('stairHoleOutline', () => {
  it('covers the straight run', () => {
    const hole = stairHoleOutline(stair())
    expect(hole.length).toBeGreaterThanOrEqual(4)
    const layout = computeStairSteps(stair(), 2.7)
    for (const step of layout.steps) {
      expect(stairHeightAt(stair(), centroid(step.polygon))).not.toBeNull()
    }
  })
})

function centroid(poly: Vec2[]): Vec2 {
  let x = 0
  let y = 0
  for (const p of poly) {
    x += p.x
    y += p.y
  }
  return { x: x / poly.length, y: y / poly.length }
}
