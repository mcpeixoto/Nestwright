import { describe, expect, it } from 'vitest'
import {
  add,
  arcPoints,
  closestPointOnSegment,
  cross,
  dist,
  dot,
  len,
  lerp,
  normalize,
  offsetPolyline,
  perp,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polylabel,
  signedDistanceToPolygon,
  rotate,
  scale,
  segmentIntersection,
  snapAngle,
  snapToGrid,
  sub,
} from '../../src/model/geometry'

describe('geometry', () => {
  it('adds, subtracts, scales and measures', () => {
    expect(add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 })
    expect(sub({ x: 3, y: 4 }, { x: 1, y: 1 })).toEqual({ x: 2, y: 3 })
    expect(scale({ x: 2, y: -1 }, 3)).toEqual({ x: 6, y: -3 })
    expect(len({ x: 3, y: 4 })).toBeCloseTo(5)
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5)
    expect(normalize({ x: 0, y: 2 })).toEqual({ x: 0, y: 1 })
    const left = perp({ x: 1, y: 0 })
    expect(left.x).toBeCloseTo(0)
    expect(left.y).toBeCloseTo(1)
    expect(dot({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(0)
    expect(cross({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(1)
    expect(lerp({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.25)).toEqual({ x: 2.5, y: 0 })
    const turned = rotate({ x: 1, y: 0 }, Math.PI / 2)
    expect(turned.x).toBeCloseTo(0)
    expect(turned.y).toBeCloseTo(1)
  })

  it('computes signed area and centroid', () => {
    const ccw = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ]
    expect(polygonArea(ccw)).toBeCloseTo(16)
    expect(polygonArea([...ccw].reverse())).toBeCloseTo(-16)
    const c = polygonCentroid(ccw)
    expect(c.x).toBeCloseTo(2)
    expect(c.y).toBeCloseTo(2)
  })

  it('tests point in polygon, including the boundary', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ]
    expect(pointInPolygon({ x: 2, y: 2 }, square)).toBe(true)
    expect(pointInPolygon({ x: 5, y: 2 }, square)).toBe(false)
    expect(pointInPolygon({ x: 0, y: 2 }, square)).toBe(true)
  })

  it('intersects segments and projects onto them', () => {
    const hit = segmentIntersection({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: -1 }, { x: 1, y: 1 })
    expect(hit).not.toBeNull()
    expect(hit?.point.x).toBeCloseTo(1)
    expect(hit?.point.y).toBeCloseTo(0)
    expect(segmentIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 })).toBeNull()
    const close = closestPointOnSegment({ x: 1, y: 2 }, { x: 0, y: 0 }, { x: 2, y: 0 })
    expect(close.point).toEqual({ x: 1, y: 0 })
    expect(close.t).toBeCloseTo(0.5)
  })

  it('snaps angle and grid', () => {
    const snapped = snapAngle({ x: 0, y: 0 }, { x: 1, y: 0.1 }, Math.PI / 12)
    expect(snapped.y).toBeCloseTo(0, 5)
    expect(Math.hypot(snapped.x, snapped.y)).toBeCloseTo(Math.hypot(1, 0.1))
    expect(snapToGrid({ x: 1.02, y: -0.49 }, 0.05)).toEqual({ x: 1, y: -0.5 })
  })

  it('bows an arc to the left of the chord and offsets a polyline', () => {
    const pts = arcPoints({ x: 0, y: 0 }, { x: 2, y: 0 }, 0.5, 8)
    expect(pts[0]).toEqual({ x: 0, y: 0 })
    expect(pts[pts.length - 1]).toEqual({ x: 2, y: 0 })
    const mid = pts[Math.floor(pts.length / 2)]!
    expect(mid.x).toBeCloseTo(1, 1)
    expect(mid.y).toBeCloseTo(0.5, 1)
    const offset = offsetPolyline(
      [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
      ],
      1,
    )
    expect(offset[0]?.y).toBeCloseTo(1)
    expect(offset[1]?.y).toBeCloseTo(1)
  })

  it('places polylabel at the centre of a rectangle and inside an L', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ]
    const centre = polylabel(square, 0.01)
    expect(centre.x).toBeCloseTo(2, 1)
    expect(centre.y).toBeCloseTo(2, 1)
    expect(signedDistanceToPolygon(centre, square)).toBeGreaterThan(1.9)

    // Horizontal bar 8×3 plus a 3×5 stub. The centroid sits nearer the inner corner
    // than the widest inscribed circle, which stays in the bar.
    const ell = [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 8 },
      { x: 0, y: 8 },
    ]
    const label = polylabel(ell, 0.02)
    const centroid = polygonCentroid(ell)
    expect(pointInPolygon(label, ell)).toBe(true)
    expect(signedDistanceToPolygon(label, ell)).toBeGreaterThan(1.35)
    expect(signedDistanceToPolygon(label, ell)).toBeGreaterThan(signedDistanceToPolygon(centroid, ell))
    expect(polylabel([], 0.1)).toEqual({ x: 0, y: 0 })
  })
})
