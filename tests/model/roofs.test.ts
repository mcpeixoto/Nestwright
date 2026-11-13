import { describe, expect, it } from 'vitest'
import { pointInPolygon, polygonArea } from '../../src/model/geometry'
import { createLevel, createWall } from '../../src/model/defaults'
import { distanceToBoundary } from '../../src/model/polygon'
import { buildRoofModel, outerOutline, roofHeightAt } from '../../src/model/roofs'
import type { Roof, RoofShape, Vec2 } from '../../src/model/types'

function rect(w = 6, d = 4): Vec2[] {
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: d },
    { x: 0, y: d },
  ]
}

function roof(shape: RoofShape, outline: Vec2[], partial: Partial<Roof> = {}): Roof {
  return {
    id: 'roof_test',
    shape,
    outline,
    pitch: Math.PI / 6,
    overhang: 0,
    ridgeAngle: 0,
    thickness: 0.08,
    material: { id: 'roof-tiles' },
    cutouts: [],
    ...partial,
  }
}

describe('outerOutline', () => {
  it('offsets an L-shaped house out by half the wall thickness', () => {
    const level = createLevel('Ground', 0)
    const loop = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 6 },
      { x: 0, y: 6 },
    ]
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]
      const b = loop[(i + 1) % loop.length]
      if (a && b) level.walls.push(createWall(a, b, { thickness: 0.2 }))
    }
    const outline = outerOutline(level)
    expect(outline.length).toBeGreaterThanOrEqual(6)
    expect(Math.abs(polygonArea(outline))).toBeGreaterThan(Math.abs(polygonArea(loop)))
    expect(pointInPolygon({ x: -0.05, y: 1 }, outline)).toBe(true)
    expect(pointInPolygon({ x: -0.25, y: 1 }, outline)).toBe(false)
    expect(pointInPolygon({ x: 4.5, y: 4.5 }, outline)).toBe(false)
    expect(pointInPolygon({ x: 1, y: 1 }, outline)).toBe(true)
  })
})

describe('buildRoofModel', () => {
  it('builds a flat slab on the expanded outline', () => {
    const model = buildRoofModel(roof('flat', rect(), { overhang: 0.4 }))
    expect(model.faces.length).toBeGreaterThan(0)
    expect(model.faces.every((face) => face.ring.every((v) => Math.abs(v.h) < 1e-6))).toBe(true)
    expect(pointInPolygon({ x: -0.2, y: -0.2 }, model.footprint)).toBe(true)
    expect(Math.abs(polygonArea(model.footprint))).toBeGreaterThan(6 * 4)
  })

  it('raises a shed toward the ridge angle and keeps the low edge at the eave', () => {
    const model = buildRoofModel(roof('shed', rect(8, 4), { ridgeAngle: 0, pitch: Math.PI / 6 }))
    const low = roofHeightAt(model, { x: 0, y: 2 })
    const high = roofHeightAt(model, { x: 7.9, y: 2 })
    expect(low).not.toBeNull()
    expect(high).not.toBeNull()
    expect(low!).toBeLessThan(0.02)
    expect(high!).toBeGreaterThan(low! + 1)
  })

  it('runs a gable ridge through the centre and fills the gable ends', () => {
    const model = buildRoofModel(roof('gable', rect(8, 4), { ridgeAngle: 0, pitch: Math.PI / 6 }))
    const eave = roofHeightAt(model, { x: 4, y: 0.05 })
    const ridge = roofHeightAt(model, { x: 4, y: 2 })
    expect(eave ?? 1).toBeLessThan(0.15)
    expect(ridge ?? 0).toBeGreaterThan(1)
    expect(model.faces.some((face) => face.kind === 'gable' && face.ring.length === 3)).toBe(true)
    expect(model.ridges.length).toBeGreaterThan(0)
  })

  it('hips a rectangle with a ridge at half the short side times tan(pitch)', () => {
    const pitch = Math.PI / 6
    const model = buildRoofModel(roof('hip', rect(6, 4), { pitch }))
    expect(model.usedBoundingRect).toBe(false)
    const centre = roofHeightAt(model, { x: 3, y: 2 })
    expect(centre).toBeCloseTo(2 * Math.tan(pitch), 1)
    expect(model.ridges.length).toBeGreaterThan(0)
    const sample = { x: 1, y: 1 }
    const h = roofHeightAt(model, sample)
    expect(h).toBeCloseTo(distanceToBoundary(sample, rect(6, 4)) * Math.tan(pitch), 1)
  })

  it('hips an orthogonal L with the straight skeleton, not the bounding rectangle', () => {
    const outline = [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 3 },
      { x: 5, y: 3 },
      { x: 5, y: 7 },
      { x: 0, y: 7 },
    ]
    const pitch = Math.PI / 6
    const model = buildRoofModel(roof('hip', outline, { pitch }))
    expect(model.usedBoundingRect).toBe(false)
    const sample = { x: 2, y: 1.5 }
    const h = roofHeightAt(model, sample)
    expect(h).toBeCloseTo(distanceToBoundary(sample, outline) * Math.tan(pitch), 1)
    expect(roofHeightAt(model, { x: 6.5, y: 5 })).toBeNull()
  })

  it('falls back to the oriented bounding rectangle for a non-orthogonal concave outline', () => {
    const outline = [
      { x: 0, y: 0 },
      { x: 6, y: 0.4 },
      { x: 5, y: 2 },
      { x: 6, y: 4 },
      { x: 0, y: 3.2 },
      { x: 1.2, y: 1.6 },
    ]
    const model = buildRoofModel(roof('hip', outline))
    expect(model.usedBoundingRect).toBe(true)
    expect(model.faces.length).toBeGreaterThan(0)
  })

  it('breaks a mansard into a steep lower pitch and a shallower top', () => {
    const pitch = Math.PI / 3
    const mansard = buildRoofModel(roof('mansard', rect(6, 4), { pitch }))
    const hip = buildRoofModel(roof('hip', rect(6, 4), { pitch }))
    const mansardTop = roofHeightAt(mansard, { x: 3, y: 2 }) ?? 0
    const hipTop = roofHeightAt(hip, { x: 3, y: 2 }) ?? 0
    expect(mansardTop).toBeGreaterThan(0.3)
    expect(mansardTop).toBeLessThan(hipTop - 0.05)
    const heights = mansard.faces.flatMap((face) => face.ring.map((v) => v.h))
    const mid = heights.filter((h) => h > 0.15 && h < mansardTop - 0.05)
    expect(mid.length).toBeGreaterThan(0)
  })

  it('domes a hemisphere over the bounding circle', () => {
    const model = buildRoofModel(roof('dome', rect(4, 4)))
    const top = roofHeightAt(model, { x: 2, y: 2 })
    expect(top).toBeGreaterThan(2)
    expect(model.faces.some((face) => face.kind === 'dome')).toBe(true)
  })
})
