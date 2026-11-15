import { describe, expect, it } from 'vitest'
import {
  levelProbeBox,
  PROBE_TIERS,
  PROBE_WALL_CLEARANCE,
  probeCellCentre,
  probeIndexCoords,
  probeLevels,
  probeResolution,
  probeTier,
  probeWalls,
  relocateProbe,
} from '../../src/model/probeGrid'
import type { Level, Wall } from '../../src/model/types'

function wall(ax: number, ay: number, bx: number, by: number, extra: Partial<Wall> = {}): Wall {
  return {
    id: `${ax},${ay}-${bx},${by}`,
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
    thickness: 0.2,
    height: 2.7,
    bulge: 0,
    left: { id: 'plaster-white' },
    right: { id: 'plaster-white' },
    ...extra,
  }
}

const square = [wall(0, 0, 10, 0), wall(10, 0, 10, 8), wall(10, 8, 0, 8), wall(0, 8, 0, 0)]

describe('probe tiers', () => {
  it('has no probes on Low and finer grids up the tiers', () => {
    expect(probeTier('low')).toBeNull()
    expect(probeTier('nonsense')).toBeNull()
    expect(PROBE_TIERS.medium.spacing).toBeGreaterThan(PROBE_TIERS.high.spacing)
    expect(PROBE_TIERS.high.spacing).toBeGreaterThan(PROBE_TIERS.ultra.spacing)
    for (const tier of Object.values(PROBE_TIERS)) {
      expect(tier.cubemapSize % 4).toBe(0)
      expect(tier.spacing).toBeGreaterThanOrEqual(0.6)
      expect(tier.spacing).toBeLessThanOrEqual(1)
      expect(tier.perAxis.x * tier.perAxis.y * tier.perAxis.z).toBeGreaterThanOrEqual(tier.maxProbes)
    }
  })
})

describe('levelProbeBox', () => {
  it('spans the walls in plan and the storey in height', () => {
    const box = levelProbeBox({ walls: square, elevation: 3, height: 2.8 })
    expect(box).toEqual({ min: { x: 0, y: 3, z: 0 }, max: { x: 10, y: 5.8, z: 8 } })
  })

  it('ignores railings and has no box without walls', () => {
    expect(levelProbeBox({ walls: [], elevation: 0, height: 2.7 })).toBeNull()
    expect(levelProbeBox({ walls: [wall(0, 0, 9, 9, { kind: 'railing' })], elevation: 0, height: 2.7 })).toBeNull()
  })
})

describe('probeResolution', () => {
  const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 2.7, z: 8 } }

  it('places a probe about every `spacing` metres, two at least per axis', () => {
    expect(probeResolution(box, 1, 10000)).toEqual({ x: 10, y: 3, z: 8 })
    const tiny = { min: { x: 0, y: 0, z: 0 }, max: { x: 0.5, y: 0.5, z: 0.5 } }
    expect(probeResolution(tiny, 1, 100)).toEqual({ x: 2, y: 2, z: 2 })
  })

  it('widens the spacing to stay under the probe cap and the atlas size', () => {
    const big = { min: { x: 0, y: 0, z: 0 }, max: { x: 40, y: 3, z: 30 } }
    const res = probeResolution(big, 0.6, 512)
    expect(res.x * res.y * res.z).toBeLessThanOrEqual(512)
    expect(res.x).toBeGreaterThan(res.z)
    const capped = probeResolution(big, 0.6, 100000, { x: 24, y: 4, z: 24 })
    expect(capped.x).toBeLessThanOrEqual(24)
    expect(capped.y).toBeLessThanOrEqual(4)
    expect(capped.z).toBeLessThanOrEqual(24)
  })

  it('maps bake indices X, then Z, then Y onto cell centres', () => {
    const res = { x: 4, y: 3, z: 2 }
    expect(probeIndexCoords(0, res)).toEqual({ ix: 0, iy: 0, iz: 0 })
    expect(probeIndexCoords(5, res)).toEqual({ ix: 1, iy: 0, iz: 1 })
    expect(probeIndexCoords(9, res)).toEqual({ ix: 1, iy: 1, iz: 0 })
    const seen = new Set<string>()
    for (let i = 0; i < 24; i++) {
      const c = probeIndexCoords(i, res)
      seen.add(`${c.ix},${c.iy},${c.iz}`)
    }
    expect(seen.size).toBe(24)
    const centre = probeCellCentre({ min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 3, z: 2 } }, res, 0, 2, 1)
    expect(centre).toEqual({ x: 0.5, y: 2.5, z: 1.5 })
  })
})

describe('relocateProbe', () => {
  const walls = probeWalls({ walls: [wall(0, 5, 10, 5), wall(5, 0, 5, 10, { kind: 'railing' })] })

  it('moves a probe out of a wall to the side it is on, clear of the face', () => {
    const moved = relocateProbe({ x: 3, y: 1, z: 5.05 }, walls)
    expect(moved.z).toBeCloseTo(5 + 0.1 + PROBE_WALL_CLEARANCE, 9)
    expect(moved.x).toBe(3)
    expect(moved.y).toBe(1)
    const other = relocateProbe({ x: 3, y: 1, z: 4.99 }, walls)
    expect(other.z).toBeCloseTo(5 - 0.1 - PROBE_WALL_CLEARANCE, 9)
  })

  it('leaves probes clear of walls, past their ends, or by a railing alone', () => {
    expect(relocateProbe({ x: 3, y: 1, z: 3 }, walls)).toEqual({ x: 3, y: 1, z: 3 })
    expect(relocateProbe({ x: 10.2, y: 1, z: 5 }, walls)).toEqual({ x: 10.2, y: 1, z: 5 })
    expect(relocateProbe({ x: 5.02, y: 1, z: 2 }, walls)).toEqual({ x: 5.02, y: 1, z: 2 })
  })

  it('settles a probe in a corner clear of both walls', () => {
    const corner = probeWalls({ walls: [wall(-5, 0, 5, 0), wall(0, -5, 0, 5)] })
    const moved = relocateProbe({ x: 0.05, y: 1, z: 0.05 }, corner)
    expect(Math.abs(moved.x)).toBeGreaterThanOrEqual(0.1 + PROBE_WALL_CLEARANCE - 1e-9)
    expect(Math.abs(moved.z)).toBeGreaterThanOrEqual(0.1 + PROBE_WALL_CLEARANCE - 1e-9)
  })
})

describe('probeLevels', () => {
  const levels = [
    { id: 'g', elevation: 0 },
    { id: 'u', elevation: 3 },
    { id: 'b', elevation: -3 },
    { id: 'r', elevation: 6 },
  ] as Pick<Level, 'id' | 'elevation'>[]

  it('gives the active level the first volume and its nearest visible neighbour the next', () => {
    expect(probeLevels(levels, 'u', () => true, 2).map((l) => l.id)).toEqual(['u', 'g'])
    expect(probeLevels(levels, 'g', () => true, 2).map((l) => l.id)).toEqual(['g', 'b'])
    expect(probeLevels(levels, 'g', (l) => l.id !== 'b', 2).map((l) => l.id)).toEqual(['g', 'u'])
    expect(probeLevels(levels, 'missing', () => true, 1).map((l) => l.id)).toEqual(['g'])
    expect(probeLevels([], 'g', () => true, 2)).toEqual([])
    expect(probeLevels(levels, 'g', () => true, 0)).toEqual([])
  })
})
