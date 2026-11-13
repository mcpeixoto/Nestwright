import { describe, expect, it } from 'vitest'
import { createOpening, createProject, createTerrain, createWall } from '../../src/model/defaults'
import {
  brushFalloff,
  contourLines,
  decodeSplat,
  dominantLayer,
  encodeSplat,
  flatten,
  flattenUnderBuilding,
  flattenUnderHouse,
  generateGarden,
  gridIndex,
  ivyLeaves,
  level,
  lower,
  paintIvy,
  paintLayer,
  pathWeights,
  raise,
  resampleTerrain,
  sampleHeight,
  scatterPoints,
  smooth,
  worldToGrid,
} from '../../src/model/terrain'
import { GROUND_LAYERS } from '../../src/model/types'
import { dist } from '../../src/model/geometry'

function sum(values: readonly number[]): number {
  return values.reduce((acc, value) => acc + value, 0)
}

describe('terrain sampling', () => {
  it('maps world coordinates onto the grid and back through bilinear samples', () => {
    const terrain = createTerrain(10, 20, 4)
    expect(worldToGrid(terrain, 0, 0)).toEqual({ x: 2, y: 2 })
    expect(worldToGrid(terrain, -5, -10)).toEqual({ x: 0, y: 0 })
    expect(gridIndex(1, 2, 4)).toBe(11)

    const bilinear = createTerrain(2, 2, 1)
    bilinear.heights = [0, 2, 4, 6]
    expect(sampleHeight(bilinear, -1, -1)).toBeCloseTo(0)
    expect(sampleHeight(bilinear, 1, -1)).toBeCloseTo(2)
    expect(sampleHeight(bilinear, -1, 1)).toBeCloseTo(4)
    expect(sampleHeight(bilinear, 0, 0)).toBeCloseTo(3)
    expect(sampleHeight(createTerrain(0, 0, 0), 1, 1)).toBe(0)
  })
})

describe('terrain brushes', () => {
  it('raises volume, lowers it, and leaves samples outside the radius alone', () => {
    const terrain = createTerrain(30, 30, 30)
    const before = sum(terrain.heights)
    const outside = gridIndex(0, 0, 30)
    const edge = gridIndex(18, 15, 30)
    raise(terrain, { x: 0, y: 0 }, 2, 1)
    expect(sum(terrain.heights)).toBeGreaterThan(before)
    expect(terrain.heights[gridIndex(15, 15, 30)]).toBeGreaterThan(0)
    expect(terrain.heights[outside]).toBe(0)
    expect(terrain.heights[edge]).toBe(0)
    expect(brushFalloff(2, 2)).toBe(0)
    expect(brushFalloff(0, 2)).toBeCloseTo(1)

    const raised = sum(terrain.heights)
    lower(terrain, { x: 0, y: 0 }, 2, 1)
    expect(sum(terrain.heights)).toBeLessThan(raised)
  })

  it('converges when flatten is repeated toward the stroke height', () => {
    const terrain = createTerrain(12, 12, 6)
    terrain.heights.fill(4)
    for (let i = 0; i < 16; i++) flatten(terrain, { x: 0, y: 0 }, 3, 1, 0.5)
    expect(sampleHeight(terrain, 0, 0)).toBeCloseTo(1, 1)
    expect(sampleHeight(terrain, 5, 5)).toBeCloseTo(4, 1)
  })

  it('smooths a spike down and lifts its neighbours', () => {
    const terrain = createTerrain(16, 16, 8)
    const center = gridIndex(4, 4, 8)
    const neighbour = gridIndex(5, 4, 8)
    terrain.heights[center] = 5
    smooth(terrain, { x: 0, y: 0 }, 4, 1)
    expect(terrain.heights[center] ?? 0).toBeLessThan(5)
    expect(terrain.heights[neighbour] ?? 0).toBeGreaterThan(0)
  })

  it('levels every sample', () => {
    const terrain = createTerrain(6, 6, 2)
    level(terrain, 2.25)
    expect(terrain.heights.every((height) => height === 2.25)).toBe(true)
  })
})

describe('terrain splat', () => {
  it('round-trips bytes and decodes a fresh lawn', () => {
    const bytes = new Uint8Array([1, 2, 3, 255, 0, 128])
    expect(Array.from(decodeSplat(encodeSplat(bytes)))).toEqual(Array.from(bytes))
    expect(Array.from(decodeSplat(encodeSplat(new Uint8Array([200]))))).toEqual([200])

    const terrain = createTerrain(4, 4, 2)
    const weights = decodeSplat(terrain.splat, 9 * GROUND_LAYERS.length)
    expect(weights[0]).toBe(255)
    expect(weights[1]).toBe(0)
    expect(Array.from(weights).reduce((acc, value) => acc + value, 0)).toBe(9 * 255)
  })

  it('paints one layer, renormalises to 255, and stops at the radius', () => {
    const terrain = createTerrain(20, 20, 10)
    paintLayer(terrain, 'gravel', { x: 0, y: 0 }, 2, 1)
    const weights = decodeSplat(terrain.splat, 11 * 11 * GROUND_LAYERS.length)
    const center = gridIndex(5, 5, 10)
    const gravel = GROUND_LAYERS.indexOf('gravel')
    expect(weights[center * 8 + gravel]).toBeGreaterThan(200)
    expect(weights[center * 8]).toBeLessThan(255)
    for (let i = 0; i < 11 * 11; i++) {
      let total = 0
      for (let layer = 0; layer < 8; layer++) total += weights[i * 8 + layer] ?? 0
      expect(total).toBe(255)
    }
    const corner = gridIndex(0, 0, 10)
    expect(dominantLayer(weights, corner)).toBe(0)
    expect(weights[corner * 8]).toBe(255)
  })
})

describe('terrain shaping', () => {
  it('flattens inside a footprint and blends across the margin', () => {
    const terrain = createTerrain(20, 20, 8)
    terrain.heights.fill(2)
    flattenUnderBuilding(
      terrain,
      [
        { x: -2, y: -2 },
        { x: 2, y: -2 },
        { x: 2, y: 2 },
        { x: -2, y: 2 },
      ],
      0,
      1,
    )
    expect(sampleHeight(terrain, 0, 0)).toBeCloseTo(0, 2)
    expect(sampleHeight(terrain, 8, 8)).toBeCloseTo(2, 2)
    const edge = sampleHeight(terrain, 2.5, 0)
    expect(edge).toBeGreaterThan(0.2)
    expect(edge).toBeLessThan(1.8)
  })

  it('flattens the ground floor of a closed house', () => {
    const project = createProject('Pad', 'house')
    const level = project.levels[0]
    expect(level).toBeTruthy()
    if (!level) return
    level.walls.push(
      createWall({ x: -3, y: -3 }, { x: 3, y: -3 }),
      createWall({ x: 3, y: -3 }, { x: 3, y: 3 }),
      createWall({ x: 3, y: 3 }, { x: -3, y: 3 }),
      createWall({ x: -3, y: 3 }, { x: -3, y: -3 }),
    )
    project.terrain.heights.fill(1.5)
    flattenUnderHouse(project, -0.02, 0.8)
    expect(sampleHeight(project.terrain, 0, 0)).toBeCloseTo(-0.02, 2)
    expect(sampleHeight(project.terrain, 14, 12)).toBeCloseTo(1.5, 1)
  })

  it('resamples a bump onto a new grid', () => {
    const terrain = createTerrain(10, 10, 4)
    raise(terrain, { x: 0, y: 0 }, 2, 1.5)
    const height = sampleHeight(terrain, 0, 0)
    const next = resampleTerrain(terrain, 16, 12, 8)
    expect(next.width).toBe(16)
    expect(next.depth).toBe(12)
    expect(next.resolution).toBe(8)
    expect(next.heights).toHaveLength(81)
    expect(sampleHeight(next, 0, 0)).toBeCloseTo(height, 0)
    expect(next.boundary[0]).toEqual({ x: -8, y: -6 })
  })
})

describe('contours, scatter and paths', () => {
  it('emits contour lines around a hill and none on flat ground', () => {
    expect(contourLines(createTerrain(8, 8, 4), 0.5)).toEqual([])
    const hill = createTerrain(8, 8, 4)
    hill.heights[gridIndex(2, 2, 4)] = 1.2
    const lines = contourLines(hill, 0.5)
    const points = lines.reduce((acc, line) => acc + line.length, 0)
    expect(lines.length).toBeGreaterThan(0)
    expect(points).toBeGreaterThan(2)
  })

  it('scatters with spacing and a stable seed', () => {
    const a = scatterPoints({ x: 0, y: 0 }, 5, 12, 1.2, 42)
    const b = scatterPoints({ x: 0, y: 0 }, 5, 12, 1.2, 42)
    expect(a).toEqual(b)
    expect(a.length).toBeGreaterThan(0)
    for (const point of a) expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(5 + 1e-6)
    for (let i = 0; i < a.length; i++) {
      for (let j = i + 1; j < a.length; j++) {
        expect(dist(a[i]!, a[j]!)).toBeGreaterThanOrEqual(1.2 - 1e-6)
      }
    }
    const blocked = scatterPoints({ x: 0, y: 0 }, 2, 8, 1.5, 1, [{ x: 0, y: 0 }])
    for (const point of blocked) expect(dist(point, { x: 0, y: 0 })).toBeGreaterThanOrEqual(1.5 - 1e-6)
  })

  it('weights cells along a polyline and ignores the field beyond the width', () => {
    const terrain = createTerrain(20, 20, 10)
    const cells = pathWeights(terrain, [{ x: -4, y: 0 }, { x: 4, y: 0 }], 2)
    const onPath = cells.find((cell) => {
      const ix = cell.index % 11
      const iy = Math.floor(cell.index / 11)
      return ix === 5 && iy === 5
    })
    expect(onPath?.weight).toBeGreaterThan(0.5)
    expect(
      cells.some((cell) => {
        const iy = Math.floor(cell.index / 11)
        return iy === 0 || iy === 10
      }),
    ).toBe(false)
  })
})

describe('ivy and gardens', () => {
  it('paints ivy up to full coverage and keeps leaves under that line', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 6, y: 0 })
    expect(ivyLeaves(wall, 'left')).toEqual([])
    paintIvy(wall, 'left', 0.4)
    paintIvy(wall, 'left', 0.9)
    paintIvy(wall, 'right', -0.2)
    expect(wall.ivy).toEqual({ left: 1, right: 0 })
    wall.ivy = { left: 0.5, right: 0 }
    const leaves = ivyLeaves(wall, 'left')
    expect(leaves.length).toBeGreaterThan(0)
    expect(ivyLeaves(wall, 'left')).toEqual(leaves)
    for (const leaf of leaves) expect(leaf.elevation).toBeLessThanOrEqual(wall.height * 0.5 + 1e-6)
    wall.ivy = { left: 1, right: 0 }
    expect(ivyLeaves(wall, 'left').length).toBeGreaterThan(leaves.length)
  })

  it('grows the same garden from the same seed', () => {
    const build = () => {
      const project = createProject('Garden', 'house')
      const level = project.levels[0]
      expect(level).toBeTruthy()
      if (!level) return project
      const south = createWall({ x: -4, y: -3 }, { x: 4, y: -3 })
      level.walls.push(
        south,
        createWall({ x: 4, y: -3 }, { x: 4, y: 3 }),
        createWall({ x: 4, y: 3 }, { x: -4, y: 3 }),
        createWall({ x: -4, y: 3 }, { x: -4, y: -3 }),
      )
      level.openings.push(createOpening('door', south.id, 4))
      return project
    }
    const first = build()
    const second = build()
    generateGarden(first, 7)
    generateGarden(second, 7)
    expect(first.terrain.plants).toEqual(second.terrain.plants)
    expect(first.terrain.splat).toBe(second.terrain.splat)
    generateGarden(first, 7)
    expect(first.terrain.plants).toEqual(second.terrain.plants)

    const other = build()
    generateGarden(other, 8)
    expect(other.terrain.plants).not.toEqual(first.terrain.plants)

    const weights = decodeSplat(first.terrain.splat, (first.terrain.resolution + 1) ** 2 * 8)
    const path = worldToGrid(first.terrain, 0, -8)
    const ix = Math.round(path.x)
    const iy = Math.round(path.y)
    expect(dominantLayer(weights, gridIndex(ix, iy, first.terrain.resolution))).toBe(GROUND_LAYERS.indexOf('gravel'))
    const lawn = worldToGrid(first.terrain, 8, 8)
    expect(dominantLayer(weights, gridIndex(Math.round(lawn.x), Math.round(lawn.y), first.terrain.resolution))).toBe(
      GROUND_LAYERS.indexOf('lawn'),
    )
    expect(first.terrain.plants.some((plant) => plant.species === 'hedge-segment')).toBe(true)
    expect(first.terrain.plants.some((plant) => plant.id.startsWith('tree_'))).toBe(true)
  })
})
