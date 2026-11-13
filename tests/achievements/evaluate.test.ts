import { describe, expect, it } from 'vitest'
import {
  changedPaintSurfaces,
  dataFeatures,
  earnedNow,
  isNightProject,
  projectSpend,
  visibleAchievements,
  type AchievementContext,
  type FeatureSet,
} from '../../src/achievements/evaluate'
import { createLevel, createProject, createWall } from '../../src/model/defaults'
import type { Level, Project } from '../../src/model/types'

const EVERYTHING: FeatureSet = {
  walls: true,
  rooms: true,
  storeys: true,
  roofs: true,
  plants: true,
  pools: true,
  walk: true,
  night: true,
  cat: true,
  coop: true,
  garden: true,
  items: true,
  paint: true,
  photo: true,
  budget: true,
}

function ctx(project: Project, partial: Partial<AchievementContext> = {}): AchievementContext {
  return {
    project,
    view: '2d',
    features: EVERYTHING,
    paintedSurfaces: [],
    photoExported: false,
    catMode: false,
    coopSession: false,
    walkedAtNight: false,
    ...partial,
  }
}

function square(level: Level, x: number, y: number, size: number): void {
  const pts = [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ]
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    if (a && b) level.walls.push(createWall(a, b))
  }
}

function levelOf(project: Project): Level {
  const level = project.levels[0]
  if (!level) throw new Error('fixture has no level')
  return level
}

describe('achievement evaluation', () => {
  it('earns first-wall from a single wall and hides it when walls are not a feature', () => {
    const project = createProject('Empty', 'house')
    expect(earnedNow(ctx(project))).not.toContain('first-wall')
    levelOf(project).walls.push(createWall({ x: 0, y: 0 }, { x: 2, y: 0 }))
    expect(earnedNow(ctx(project))).toContain('first-wall')
    expect(visibleAchievements({ ...EVERYTHING, walls: false }).map((item) => item.id)).not.toContain('first-wall')
  })

  it('earns first-room at one closed room and ten-rooms only at ten', () => {
    const project = createProject('Rooms', 'house')
    const level = levelOf(project)
    square(level, 0, 0, 4)
    expect(earnedNow(ctx(project))).toContain('first-room')
    expect(earnedNow(ctx(project))).not.toContain('ten-rooms')
    for (let i = 1; i < 10; i++) square(level, i * 20, 0, 3)
    expect(earnedNow(ctx(project))).toContain('ten-rooms')
  })

  it('earns two-storeys only when a second level exists', () => {
    const project = createProject('Floors', 'house')
    expect(earnedNow(ctx(project))).not.toContain('two-storeys')
    project.levels.push(createLevel('Up', 2.7))
    expect(earnedNow(ctx(project))).toContain('two-storeys')
  })

  it('earns roof-over-head when any level has a roof', () => {
    const project = createProject('Roof', 'house')
    expect(earnedNow(ctx(project))).not.toContain('roof-over-head')
    levelOf(project).roofs.push({
      id: 'roof-1',
      shape: 'gable',
      outline: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
      ],
      pitch: 0.6,
      overhang: 0.3,
      ridgeAngle: 0,
      thickness: 0.2,
      material: { id: 'slate-tile' },
      cutouts: [],
    })
    expect(earnedNow(ctx(project))).toContain('roof-over-head')
  })

  it('earns green-thumb at 100 plants and not at 99', () => {
    const project = createProject('Garden', 'house')
    for (let i = 0; i < 99; i++) {
      project.terrain.plants.push({
        id: `plant-${i}`,
        species: 'shrub',
        position: { x: i, y: 0 },
        scale: 1,
        rotation: 0,
      })
    }
    expect(earnedNow(ctx(project))).not.toContain('green-thumb')
    project.terrain.plants.push({
      id: 'plant-99',
      species: 'shrub',
      position: { x: 99, y: 0 },
      scale: 1,
      rotation: 0,
    })
    expect(earnedNow(ctx(project))).toContain('green-thumb')
  })

  it('earns pool-day for a pool and not for a pond', () => {
    const project = createProject('Water', 'house')
    project.terrain.water.push({
      id: 'pond-1',
      kind: 'pond',
      polygon: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
      ],
      level: 0,
    })
    expect(earnedNow(ctx(project))).not.toContain('pool-day')
    project.terrain.water.push({
      id: 'pool-1',
      kind: 'pool',
      polygon: [
        { x: 6, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 4 },
        { x: 6, y: 4 },
      ],
      level: 0,
    })
    expect(earnedNow(ctx(project))).toContain('pool-day')
  })

  it('earns night-owl only after walking while the sun is down', () => {
    const project = createProject('Night', 'house')
    project.environment.time = 0
    expect(isNightProject(project)).toBe(true)
    expect(earnedNow(ctx(project, { view: '3d' }))).not.toContain('night-owl')
    expect(earnedNow(ctx(project, { view: 'walk' }))).toContain('night-owl')
    project.environment.time = 12
    expect(isNightProject(project)).toBe(false)
    expect(earnedNow(ctx(project, { view: 'walk' }))).not.toContain('night-owl')
    expect(earnedNow(ctx(project, { view: '2d', walkedAtNight: true }))).toContain('night-owl')
  })

  it('earns cat-mode, together, photographer, and interior-designer from session facts', () => {
    const project = createProject('Session', 'house')
    expect(earnedNow(ctx(project, { catMode: true }))).toContain('cat-mode')
    expect(earnedNow(ctx(project))).not.toContain('cat-mode')
    expect(earnedNow(ctx(project, { coopSession: true }))).toContain('together')
    expect(earnedNow(ctx(project, { photoExported: true }))).toContain('photographer')
    const painted = Array.from({ length: 20 }, (_, i) => `wall:w${i}:left`)
    expect(earnedNow(ctx(project, { paintedSurfaces: painted.slice(0, 19) }))).not.toContain('interior-designer')
    expect(earnedNow(ctx(project, { paintedSurfaces: painted }))).toContain('interior-designer')
  })

  it('hides achievements whose feature is absent', () => {
    const hidden = visibleAchievements({
      ...EVERYTHING,
      cat: false,
      coop: false,
      photo: false,
      paint: false,
      budget: false,
    }).map((item) => item.id)
    expect(hidden).not.toContain('cat-mode')
    expect(hidden).not.toContain('together')
    expect(hidden).not.toContain('photographer')
    expect(hidden).not.toContain('interior-designer')
    expect(hidden).not.toContain('budget-master')
    expect(hidden).toContain('first-wall')
  })

  it('earns dream-house at 150 m² with a roof, a garden, and 50 items', () => {
    const project = createProject('Dream', 'house')
    const level = levelOf(project)
    square(level, 0, 0, 13)
    expect(earnedNow(ctx(project))).not.toContain('dream-house')
    level.roofs.push({
      id: 'roof-1',
      shape: 'hip',
      outline: [
        { x: 0, y: 0 },
        { x: 13, y: 0 },
        { x: 13, y: 13 },
        { x: 0, y: 13 },
      ],
      pitch: 0.5,
      overhang: 0.4,
      ridgeAngle: 0,
      thickness: 0.2,
      material: { id: 'slate-tile' },
      cutouts: [],
    })
    project.terrain.plants.push({
      id: 'plant-1',
      species: 'tree',
      position: { x: -2, y: -2 },
      scale: 1,
      rotation: 0,
    })
    for (let i = 0; i < 50; i++) {
      level.items.push({
        id: `item-${i}`,
        catalogId: 'chair',
        position: { x: i * 0.1, y: 1 },
        elevation: 0,
        rotation: 0,
        size: { w: 0.5, d: 0.5, h: 0.8 },
        materials: {},
        params: {},
      })
    }
    expect(earnedNow(ctx(project))).toContain('dream-house')
    project.terrain.plants = []
    expect(earnedNow(ctx(project))).not.toContain('dream-house')
  })

  it('earns budget-master only when a target is set and the spend stays under it', () => {
    const project = createProject('Budget', 'house')
    square(levelOf(project), 0, 0, 4)
    project.budget.buildCostPerM2 = 100
    expect(projectSpend(project)).toBe(1600)
    expect(earnedNow(ctx(project))).not.toContain('budget-master')
    const withTarget = project.budget as Project['budget'] & { target?: number }
    withTarget.target = 1599
    expect(earnedNow(ctx(project))).not.toContain('budget-master')
    withTarget.target = 1600
    expect(earnedNow(ctx(project))).toContain('budget-master')
    levelOf(project).items.push({
      id: 'lamp',
      catalogId: 'lamp',
      position: { x: 1, y: 1 },
      elevation: 0,
      rotation: 0,
      size: { w: 0.2, d: 0.2, h: 0.4 },
      materials: {},
      params: {},
      price: 50,
    })
    expect(projectSpend(project)).toBe(1650)
    expect(earnedNow(ctx(project))).not.toContain('budget-master')
  })

  it('adds finish cost per square metre of the room floor', () => {
    const project = createProject('Finish', 'house')
    square(levelOf(project), 0, 0, 4)
    project.budget.buildCostPerM2 = 0
    project.budget.finishCostPerM2 = { 'oak-planks': 25 }
    expect(projectSpend(project)).toBe(400)
  })

  it('hides garden and pool achievements when those fields are missing, without throwing', () => {
    const project = createProject('Broken', 'house')
    const broken = { ...project, terrain: undefined, environment: undefined } as unknown as Project
    expect(() => earnedNow(ctx(broken, { features: dataFeatures(broken) }))).not.toThrow()
    const ids = visibleAchievements(dataFeatures(broken)).map((item) => item.id)
    expect(ids).not.toContain('green-thumb')
    expect(ids).not.toContain('pool-day')
    expect(ids).not.toContain('dream-house')
    expect(ids).not.toContain('budget-master')
  })

  it('records a painted surface only when its material changes', () => {
    const before = createProject('Paint', 'house')
    const wall = createWall({ x: 0, y: 0 }, { x: 3, y: 0 })
    levelOf(before).walls.push(wall)
    const after = structuredClone(before)
    const changed = after.levels[0]?.walls[0]
    if (!changed) throw new Error('fixture lost the wall')
    changed.left = { id: 'paint-sage' }
    expect(changedPaintSurfaces(before, after)).toEqual([`wall:${wall.id}:left`])
    expect(changedPaintSurfaces(after, structuredClone(after))).toEqual([])
    const floored = structuredClone(after)
    floored.levels[0]?.rooms.push({
      key: 'room-a',
      name: 'Living',
      type: 'living',
      floor: { id: 'paint-sage' },
      ceiling: { id: 'plaster-white' },
    })
    expect(changedPaintSurfaces(after, floored).sort()).toEqual(['ceiling:room-a', 'floor:room-a'])
    const repainted = structuredClone(floored)
    const room = repainted.levels[0]?.rooms[0]
    if (!room) throw new Error('fixture lost the room')
    room.floor = { id: 'paint-clay' }
    expect(changedPaintSurfaces(floored, repainted)).toEqual(['floor:room-a'])
  })
})
