import { describe, expect, it } from 'vitest'
import '../../src/catalog'
import { getEntry } from '../../src/catalog/registry'
import { detectRooms } from '../../src/model/rooms'
import { decodeSplat, dominantLayer, splatLength } from '../../src/model/terrain'
import { GROUND_LAYERS, type Project } from '../../src/model/types'
import { furnish } from '../../src/templates/build'
import {
  TEMPLATES,
  apartmentFloor,
  beachHouse,
  bungalow,
  courtyardHouse,
  emptyPlot,
  familyHouse,
  studioApartment,
  twoBedApartment,
} from '../../src/templates'

function areaOf(project: Project): number {
  return project.levels.reduce((sum, level) => sum + detectRooms(level).reduce((roomSum, room) => roomSum + room.area, 0), 0)
}

function names(project: Project): string[] {
  return project.levels.flatMap((level) => detectRooms(level).map((room) => room.name))
}

function types(project: Project): string[] {
  return project.levels.flatMap((level) => detectRooms(level).map((room) => room.type))
}

describe('templates', () => {
  it('builds an empty 30 by 40 plot with the boundary drawn', () => {
    const project = emptyPlot()
    expect(project.kind).toBe('house')
    expect(project.terrain.enabled).toBe(true)
    expect(project.terrain.width).toBe(30)
    expect(project.terrain.depth).toBe(40)
    expect(project.terrain.boundary).toHaveLength(4)
    expect(project.levels[0]?.walls).toHaveLength(0)
  })

  it('builds a furnished studio of about 35 m² without terrain', () => {
    const project = studioApartment()
    expect(project.kind).toBe('apartment')
    expect(project.terrain.enabled).toBe(false)
    expect(areaOf(project)).toBeCloseTo(35, 0)
    expect(names(project)).toEqual(expect.arrayContaining(['Living', 'Bathroom', 'Entrance']))
    expect(project.levels[0]?.slabs.length).toBeGreaterThan(0)
    expect(project.levels[0]?.walls.some((wall) => wall.kind === 'railing')).toBe(true)
    expect(project.levels[0]?.openings.some((opening) => opening.type === 'door')).toBe(true)
    if (getEntry('sofa-3')) expect(project.levels[0]?.items.some((item) => item.catalogId === 'sofa-3')).toBe(true)
  })

  it('builds a two-bedroom apartment of about 80 m² with two baths and a kitchen run', () => {
    const project = twoBedApartment()
    expect(project.kind).toBe('apartment')
    expect(project.terrain.enabled).toBe(false)
    expect(areaOf(project)).toBeCloseTo(80, 0)
    expect(types(project).filter((type) => type === 'bathroom')).toHaveLength(2)
    if (getEntry('kitchen-run')) expect(project.levels[0]?.items.some((item) => item.catalogId === 'kitchen-run')).toBe(true)
  })

  it('names the three units on an apartment floor', () => {
    const project = apartmentFloor()
    expect(project.kind).toBe('apartment')
    expect(project.terrain.enabled).toBe(false)
    const found = names(project)
    expect(found).toEqual(expect.arrayContaining(['Unit A', 'Unit B', 'Unit C']))
    expect(found.some((name) => name === 'Corridor')).toBe(true)
    expect(project.levels[0]?.stairs.length).toBeGreaterThan(0)
  })

  it('builds a hip-roof bungalow with a garden and a terrace', () => {
    const project = bungalow()
    expect(areaOf(project)).toBeCloseTo(110.4, 0)
    expect(project.levels[0]?.roofs.some((roof) => roof.shape === 'hip')).toBe(true)
    expect(project.levels[0]?.slabs.length).toBeGreaterThan(0)
    expect(project.terrain.enabled).toBe(true)
    expect(project.terrain.plants.length).toBeGreaterThan(0)
  })

  it('builds a two-storey family house with a stair, gable, garage, garden, and pool', () => {
    const project = familyHouse()
    expect(project.levels).toHaveLength(2)
    const total = areaOf(project)
    expect(total).toBeGreaterThan(165)
    expect(total).toBeLessThan(200)
    expect(types(project)).toContain('garage')
    expect(project.levels.some((level) => level.stairs.length > 0)).toBe(true)
    expect(project.levels.some((level) => level.roofs.some((roof) => roof.shape === 'gable'))).toBe(true)
    expect(project.terrain.plants.length).toBeGreaterThan(0)
    expect(project.terrain.water.some((body) => body.kind === 'pool')).toBe(true)
  })

  it('builds a stilted beach house on sand with a flat roof and tall windows', () => {
    const project = beachHouse()
    expect(project.terrain.enabled).toBe(true)
    const weights = decodeSplat(project.terrain.splat, splatLength(project.terrain))
    expect(dominantLayer(weights, 0)).toBe(GROUND_LAYERS.indexOf('sand'))
    const house = project.levels[1]
    expect(house?.elevation).toBeGreaterThan(1)
    expect(project.levels[0]?.columns.length).toBeGreaterThan(0)
    expect(house?.roofs.some((roof) => roof.shape === 'flat')).toBe(true)
    expect(house?.openings.some((opening) => opening.type === 'tall-window')).toBe(true)
  })

  it('builds a courtyard house around a tree under a flat roof', () => {
    const project = courtyardHouse()
    expect(project.levels[0]?.roofs.some((roof) => roof.shape === 'flat')).toBe(true)
    expect(areaOf(project)).toBeGreaterThan(80)
    expect(project.terrain.plants.some((plant) => plant.species === 'olive')).toBe(true)
    expect(names(project).length).toBeGreaterThan(1)
  })

  it('skips catalog ids that are not registered', () => {
    const project = emptyPlot()
    const level = project.levels[0]
    expect(level).toBeTruthy()
    if (!level) return
    furnish(level, 'not-a-real-catalog-id', 0, 0)
    expect(level.items).toHaveLength(0)
  })

  it('exposes eight templates', () => {
    expect(TEMPLATES.map((item) => item.id)).toEqual([
      'empty',
      'studio',
      'two-bed',
      'floor',
      'bungalow',
      'family',
      'beach',
      'courtyard',
    ])
    for (const item of TEMPLATES) {
      const project = item.create()
      expect(project.levels.length).toBeGreaterThan(0)
      expect(project.name.length).toBeGreaterThan(0)
    }
  })
})
