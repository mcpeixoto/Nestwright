import { describe, expect, it } from 'vitest'
import { createLevel, createOpening, createProject, createWall } from '../../../src/model/defaults'
import { BRIEFS, scoreBrief } from '../../../src/model/briefs'
import type { HouseBrief } from '../../../src/model/briefs'
import { roomAt } from '../../../src/model/rooms'
import type { Level, OpeningType, Project, RoomType, Vec2, Wall } from '../../../src/model/types'
import { locateOnWall } from '../../../src/model/walls'

function brief(id: string): HouseBrief {
  const found = BRIEFS.find((item) => item.id === id)
  if (!found) throw new Error(`missing brief ${id}`)
  return found
}

function check(project: Project, id: string, checkId: string) {
  const result = scoreBrief(project, brief(id))
  const item = result.checks.find((entry) => entry.id === checkId)
  if (!item) throw new Error(`missing check ${checkId}`)
  return { result, item }
}

function addWall(level: Level, a: Vec2, b: Vec2): Wall {
  const wall = createWall(a, b)
  level.walls.push(wall)
  return wall
}

function openingAt(level: Level, wall: Wall, type: OpeningType, at: Vec2, width: number, height: number) {
  const loc = locateOnWall(wall, at)
  level.openings.push(createOpening(type, wall.id, loc.distance, { width, height }))
}

function setRoom(level: Level, at: Vec2, type: RoomType, name: string) {
  const found = roomAt(level, at)
  if (!found) throw new Error(`no room at ${at.x},${at.y}`)
  level.rooms.push({
    key: found.key,
    name,
    type,
    floor: { id: 'oak-planks' },
    ceiling: { id: 'plaster-white' },
  })
}

/** One-bedroom flat inside the starter plot: living, bedroom, kitchen, bathroom. */
function starterFlat(): Project {
  const project = createProject('Starter', 'apartment')
  const level = project.levels[0]!
  const x0 = -4.25
  const x1 = 4.25
  const y0 = -3.6
  const y1 = 3.6
  const yLiving = 0.4
  const yWet = -1.2
  const north = addWall(level, { x: x1, y: y1 }, { x: x0, y: y1 })
  const west = addWall(level, { x: x0, y: y1 }, { x: x0, y: y0 })
  const south = addWall(level, { x: x0, y: y0 }, { x: x1, y: y0 })
  addWall(level, { x: x1, y: y0 }, { x: x1, y: y1 })
  const livingWall = addWall(level, { x: x0, y: yLiving }, { x: x1, y: yLiving })
  addWall(level, { x: 0, y: y0 }, { x: 0, y: yLiving })
  const wet = addWall(level, { x: 0, y: yWet }, { x: x1, y: yWet })

  openingAt(level, north, 'door', { x: 0, y: y1 }, 0.9, 2.1)
  openingAt(level, livingWall, 'door', { x: -2.1, y: yLiving }, 0.9, 2.1)
  openingAt(level, livingWall, 'door', { x: 2.1, y: yLiving }, 0.9, 2.1)
  openingAt(level, wet, 'door', { x: 2.1, y: yWet }, 0.9, 2.1)
  openingAt(level, north, 'window', { x: -2.6, y: y1 }, 2.4, 1.2)
  openingAt(level, west, 'window', { x: x0, y: -1.6 }, 1.6, 1.4)
  openingAt(level, south, 'window', { x: 2.1, y: y0 }, 1.4, 1.2)

  setRoom(level, { x: 0, y: 2 }, 'living', 'Living')
  setRoom(level, { x: -2, y: -1.6 }, 'bedroom', 'Bedroom')
  setRoom(level, { x: 2.1, y: -2.4 }, 'kitchen', 'Kitchen')
  setRoom(level, { x: 2.1, y: -0.4 }, 'bathroom', 'Bathroom')
  return project
}

function pairBrief(): HouseBrief {
  return {
    id: 'pair',
    order: 1,
    title: { en: 'Pair', pt: 'Par' },
    summary: { en: 'Two rooms side by side.', pt: 'Duas divisões lado a lado.' },
    plot: { width: 20, depth: 20 },
    rooms: [
      { type: 'living', count: 1 },
      { type: 'bedroom', count: 1 },
    ],
  }
}

function twoRooms(): { project: Project; divider: Wall; outside: Wall } {
  const project = createProject('Pair', 'house')
  const level = project.levels[0]!
  const outside = addWall(level, { x: -3, y: 2 }, { x: -3, y: -2 })
  addWall(level, { x: -3, y: -2 }, { x: 3, y: -2 })
  addWall(level, { x: 3, y: -2 }, { x: 3, y: 2 })
  addWall(level, { x: 3, y: 2 }, { x: -3, y: 2 })
  const divider = addWall(level, { x: 0, y: -2 }, { x: 0, y: 2 })
  setRoom(level, { x: -1.5, y: 0 }, 'living', 'Living')
  setRoom(level, { x: 1.5, y: 0 }, 'bedroom', 'Bedroom')
  return { project, divider, outside }
}

describe('scoreBrief', () => {
  it('gives the starter flat three stars', () => {
    const result = scoreBrief(starterFlat(), brief('starter-flat-for-two'))
    expect(result.stars, JSON.stringify(result.checks, null, 2)).toBe(3)
    expect(result.checks.every((item) => item.ok)).toBe(true)
    expect(result.checks.every((item) => item.label.en && item.label.pt && item.label.en !== item.label.pt)).toBe(true)
  })

  it('drops to zero stars when the bedroom is gone', () => {
    const project = starterFlat()
    const level = project.levels[0]!
    const bedroom = level.rooms.find((room) => room.type === 'bedroom')
    if (!bedroom) throw new Error('bedroom missing')
    bedroom.type = 'storage'
    const result = scoreBrief(project, brief('starter-flat-for-two'))
    expect(result.stars).toBe(0)
    expect(result.checks.find((item) => item.id === 'room:bedroom')?.ok).toBe(false)
  })

  it('drops to one star when the estimate is over the budget', () => {
    const project = starterFlat()
    project.levels[0]!.items.push({
      id: 'sofa',
      catalogId: 'sofa-2',
      position: { x: 0, y: 2 },
      elevation: 0,
      rotation: 0,
      size: { w: 0.4, d: 0.4, h: 0.8 },
      materials: {},
      params: {},
      price: 500_000,
    })
    const { result, item } = check(project, 'starter-flat-for-two', 'budget')
    expect(item.ok).toBe(false)
    expect(result.checks.find((entry) => entry.id === 'room:bedroom')?.ok).toBe(true)
    expect(result.stars).toBe(1)
  })

  it('fails circulation when a room has no door', () => {
    const project = createProject('Box', 'house')
    const level = project.levels[0]!
    addWall(level, { x: -2, y: -2 }, { x: 2, y: -2 })
    addWall(level, { x: 2, y: -2 }, { x: 2, y: 2 })
    addWall(level, { x: 2, y: 2 }, { x: -2, y: 2 })
    addWall(level, { x: -2, y: 2 }, { x: -2, y: -2 })
    setRoom(level, { x: 0, y: 0 }, 'living', 'Living')
    const result = scoreBrief(project, pairBrief())
    expect(result.checks.find((item) => item.id === 'circulation')?.ok).toBe(false)
  })

  it('connects two rooms when a door sits on their shared wall', () => {
    const closed = twoRooms()
    const blocked = scoreBrief(closed.project, pairBrief())
    expect(blocked.checks.find((item) => item.id === 'circulation')?.ok).toBe(false)

    const linked = twoRooms()
    openingAt(linked.project.levels[0]!, linked.divider, 'door', { x: 0, y: 0 }, 0.9, 2.1)
    openingAt(linked.project.levels[0]!, linked.outside, 'door', { x: -3, y: 0 }, 0.9, 2.1)
    const open = scoreBrief(linked.project, pairBrief())
    expect(open.checks.find((item) => item.id === 'circulation')?.ok).toBe(true)
  })

  it('reaches outside only through an exterior door', () => {
    const indoors = twoRooms()
    openingAt(indoors.project.levels[0]!, indoors.divider, 'door', { x: 0, y: 0 }, 0.9, 2.1)
    expect(scoreBrief(indoors.project, pairBrief()).checks.find((item) => item.id === 'circulation')?.ok).toBe(false)

    const project = createProject('Door', 'house')
    const level = project.levels[0]!
    const west = addWall(level, { x: -2, y: 2 }, { x: -2, y: -2 })
    addWall(level, { x: -2, y: -2 }, { x: 2, y: -2 })
    addWall(level, { x: 2, y: -2 }, { x: 2, y: 2 })
    addWall(level, { x: 2, y: 2 }, { x: -2, y: 2 })
    openingAt(level, west, 'door', { x: -2, y: 0 }, 0.9, 2.1)
    setRoom(level, { x: 0, y: 0 }, 'living', 'Living')
    const one: HouseBrief = { ...pairBrief(), rooms: [{ type: 'living', count: 1 }] }
    expect(scoreBrief(project, one).checks.find((item) => item.id === 'circulation')?.ok).toBe(true)
  })

  it('fails accessible when a door is 0.75 m wide', () => {
    const project = starterFlat()
    const door = project.levels[0]!.openings.find((item) => item.type === 'door')
    if (!door) throw new Error('door missing')
    door.width = 0.75
    const { result, item } = check(project, 'accessible-bungalow', 'accessible')
    expect(item.ok).toBe(false)
    expect(item.detail?.en).toMatch(/0\.85/)
    expect(result.stars).toBe(2)
  })

  it('fails daylight when a bedroom has no window', () => {
    const project = starterFlat()
    const level = project.levels[0]!
    const bedroom = roomAt(level, { x: -2, y: -1.6 })
    if (!bedroom) throw new Error('bedroom missing')
    const walls = new Set(bedroom.key.split(','))
    level.openings = level.openings.filter((item) => item.type !== 'window' || !walls.has(item.wallId))
    const { result, item } = check(project, 'starter-flat-for-two', 'daylight')
    expect(item.ok).toBe(false)
    expect(result.stars).toBe(2)
  })

  it('fails plot fit when a wall ends outside the plot', () => {
    const project = starterFlat()
    project.levels[0]!.walls[0]!.b = { x: 30, y: 30 }
    const { item } = check(project, 'starter-flat-for-two', 'plot')
    expect(item.ok).toBe(false)
  })

  it('links storeys when a stair joins the room below to the room above', () => {
    const project = createProject('Stair', 'house')
    const ground = project.levels[0]!
    const upper = createLevel('Upper', 2.7)
    project.levels.push(upper)
    for (const level of [ground, upper]) {
      addWall(level, { x: -3, y: -2 }, { x: 5, y: -2 })
      addWall(level, { x: 5, y: -2 }, { x: 5, y: 2 })
      addWall(level, { x: 5, y: 2 }, { x: -3, y: 2 })
      addWall(level, { x: -3, y: 2 }, { x: -3, y: -2 })
      setRoom(level, { x: 0, y: 0 }, 'living', level === ground ? 'Living' : 'Landing')
    }
    const west = ground.walls[3]!
    openingAt(ground, west, 'door', { x: -3, y: 0 }, 0.9, 2.1)
    const one: HouseBrief = { ...pairBrief(), rooms: [{ type: 'living', count: 1 }] }
    expect(scoreBrief(project, one).checks.find((item) => item.id === 'circulation')?.ok).toBe(false)
    ground.stairs.push({
      id: 'stair',
      shape: 'straight',
      position: { x: -1, y: 0 },
      rotation: 0,
      width: 0.9,
      rise: 2.7,
      material: { id: 'oak-planks' },
      railing: true,
    })
    expect(scoreBrief(project, one).checks.find((item) => item.id === 'circulation')?.ok).toBe(true)
  })
})
