import { describe, expect, it } from 'vitest'
import { createProject, createWall } from '../../src/model/defaults'
import { checkRequirements, unmetRoomKeys } from '../../src/model/requirements'
import { detectRooms } from '../../src/model/rooms'
import type { Item, Level, Vec2 } from '../../src/model/types'

function loop(level: Level, points: Vec2[]) {
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (a && b) level.walls.push(createWall(a, b))
  }
}

function chair(at: Vec2): Item {
  return {
    id: 'chair',
    catalogId: 'sofa-2',
    position: at,
    elevation: 0,
    rotation: 0,
    size: { w: 1, d: 1, h: 1 },
    materials: {},
    params: {},
  }
}

describe('checkRequirements', () => {
  it('ticks area and catalog items that actually sit in the room', () => {
    const project = createProject('Brief', 'house')
    const level = project.levels[0]!
    loop(level, [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ])
    const room = detectRooms(level)[0]!
    project.requirements = [
      { id: 'area-ok', roomKey: room.key, rule: { kind: 'min-area', area: 10 }, text: 'At least 10 m²' },
      { id: 'area-big', roomKey: room.key, rule: { kind: 'min-area', area: 20 }, text: 'At least 20 m²' },
      { id: 'needs-sofa', roomKey: room.key, rule: { kind: 'has-item', catalogId: 'sofa-2' }, text: 'Needs a sofa' },
      { id: 'gone', roomKey: 'missing', rule: { kind: 'min-area', area: 1 }, text: 'Gone' },
    ]
    let status = checkRequirements(project)
    expect(status.find((item) => item.requirement.id === 'area-ok')?.met).toBe(true)
    expect(status.find((item) => item.requirement.id === 'area-big')?.met).toBe(false)
    expect(status.find((item) => item.requirement.id === 'needs-sofa')?.met).toBe(false)
    expect(status.find((item) => item.requirement.id === 'gone')?.met).toBe(false)
    expect(unmetRoomKeys(project).has(room.key)).toBe(true)

    level.items.push(chair({ x: 9, y: 9 }))
    expect(checkRequirements(project).find((item) => item.requirement.id === 'needs-sofa')?.met).toBe(false)

    level.items[0]!.position = { x: 2, y: 2 }
    status = checkRequirements(project)
    expect(status.find((item) => item.requirement.id === 'needs-sofa')?.met).toBe(true)
    project.requirements = project.requirements.filter((item) => item.id === 'needs-sofa' || item.id === 'area-ok')
    expect(unmetRoomKeys(project).size).toBe(0)
  })
})
