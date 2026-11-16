import { describe, expect, it } from 'vitest'
import { createOpening, createProject, createWall } from '../../src/model/defaults'
import { decodeSplat, distanceToPolyline, dominantLayer, generateGarden, gridIndex, worldToGrid } from '../../src/model/terrain'
import type { Project } from '../../src/model/types'
import { GROUND_LAYERS } from '../../src/model/types'

const PAVING = GROUND_LAYERS.indexOf('paving')
const SOIL = GROUND_LAYERS.indexOf('soil')
const GRAVEL = GROUND_LAYERS.indexOf('gravel')
const BED_SPECIES = ['flowers-mixed', 'lavender', 'bush-flowering']

/** 8×6 m house, front door centred on the south wall. Plot is the project default. */
function house(opts: { garage?: boolean; pool?: boolean } = {}): Project {
  const project = createProject('Garden', 'house')
  const level = project.levels[0]
  expect(level).toBeTruthy()
  if (!level) return project
  const south = createWall({ x: -4, y: -3 }, { x: 4, y: -3 })
  const east = createWall({ x: 4, y: -3 }, { x: 4, y: 3 })
  level.walls.push(
    south,
    east,
    createWall({ x: 4, y: 3 }, { x: -4, y: 3 }),
    createWall({ x: -4, y: 3 }, { x: -4, y: -3 }),
  )
  level.openings.push(createOpening('door', south.id, 4))
  if (opts.garage) level.openings.push(createOpening('garage-door', east.id, 3))
  if (opts.pool) {
    // Left edge at x=8.2 so the grid sample at (7.5, 5.625) sits 0.7 m outside.
    project.terrain.water.push({
      id: 'pool',
      kind: 'pool',
      polygon: [
        { x: 8.2, y: 3 },
        { x: 13, y: 3 },
        { x: 13, y: 8 },
        { x: 8.2, y: 8 },
      ],
      level: 0,
    })
  }
  return project
}

function layerAt(project: Project, x: number, y: number): number {
  const terrain = project.terrain
  const weights = decodeSplat(terrain.splat, (terrain.resolution + 1) ** 2 * GROUND_LAYERS.length)
  const g = worldToGrid(terrain, x, y)
  return dominantLayer(weights, gridIndex(Math.round(g.x), Math.round(g.y), terrain.resolution))
}

describe('garden layout', () => {
  it('paves a band behind the house and stops short of the lawn beyond it', () => {
    const project = house()
    generateGarden(project, 3)
    expect(layerAt(project, 0, 4)).toBe(PAVING)
    expect(layerAt(project, 0, 7)).not.toBe(PAVING)
  })

  it('paves a driveway out from a garage door', () => {
    const withDoor = house({ garage: true })
    const plain = house()
    generateGarden(withDoor, 3)
    generateGarden(plain, 3)
    expect(layerAt(withDoor, 7, 0)).toBe(PAVING)
    expect(layerAt(plain, 7, 0)).not.toBe(PAVING)
  })

  it('paves a deck around a pool and leaves the water itself unpaved', () => {
    const project = house({ pool: true })
    generateGarden(project, 3)
    expect(layerAt(project, 7.5, 5.625)).toBe(PAVING)
    expect(layerAt(project, 10, 5.625)).not.toBe(PAVING)
  })

  it('soils a flowerbed along the front wall and keeps the door gravel', () => {
    const project = house()
    generateGarden(project, 3)
    expect(layerAt(project, 3, -3.45)).toBe(SOIL)
    expect(layerAt(project, 0, -3.75)).toBe(GRAVEL)
  })

  it('plants the beds with the bed species, close to a wall', () => {
    const project = house()
    generateGarden(project, 11)
    const beds = project.terrain.plants.filter((plant) => plant.id.startsWith('bed_'))
    expect(beds.length).toBeGreaterThan(0)
    const walls = project.levels[0]?.walls ?? []
    for (const plant of beds) {
      expect(plant.id.startsWith(`bed_11_`)).toBe(true)
      expect(BED_SPECIES).toContain(plant.species)
      expect(plant.scale).toBeGreaterThanOrEqual(0.8)
      expect(plant.scale).toBeLessThanOrEqual(1.1)
      const nearest = Math.min(...walls.map((wall) => distanceToPolyline(plant.position, [wall.a, wall.b])))
      expect(nearest).toBeLessThanOrEqual(1.2)
    }
  })

  it('keeps trees off paving and soil', () => {
    const project = house({ garage: true, pool: true })
    generateGarden(project, 5)
    const trees = project.terrain.plants.filter((plant) => plant.id.startsWith('tree_'))
    expect(trees.length).toBeGreaterThan(0)
    for (const tree of trees) {
      const layer = layerAt(project, tree.position.x, tree.position.y)
      expect(layer).not.toBe(PAVING)
      expect(layer).not.toBe(SOIL)
    }
  })

  it('repeats the same layout for the same seed', () => {
    const first = house({ garage: true, pool: true })
    const second = house({ garage: true, pool: true })
    generateGarden(first, 7)
    generateGarden(second, 7)
    expect(first.terrain.splat).toBe(second.terrain.splat)
    expect(first.terrain.plants).toEqual(second.terrain.plants)
    generateGarden(first, 7)
    expect(first.terrain.splat).toBe(second.terrain.splat)
    expect(first.terrain.plants).toEqual(second.terrain.plants)
  })
})
