import { describe, expect, it } from 'vitest'
import { closestPointOnSegment, dist, pointInPolygon } from '../../src/model/geometry'
import { createProject, createWall } from '../../src/model/defaults'
import { roomCameraPose } from '../../src/model/roomCamera'
import { detectRooms } from '../../src/model/rooms'
import type { Level, Vec2 } from '../../src/model/types'
import { familyHouse } from '../../src/templates'

function rect(level: Level, x0: number, y0: number, x1: number, y1: number) {
  level.walls.push(
    createWall({ x: x0, y: y0 }, { x: x1, y: y0 }),
    createWall({ x: x1, y: y0 }, { x: x1, y: y1 }),
    createWall({ x: x1, y: y1 }, { x: x0, y: y1 }),
    createWall({ x: x0, y: y1 }, { x: x0, y: y0 }),
  )
}

function edgeGap(point: Vec2, polygon: readonly Vec2[]): number {
  let best = Infinity
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    if (!a || !b) continue
    const hit = closestPointOnSegment(point, a, b)
    best = Math.min(best, dist(point, hit.point))
  }
  return best
}

describe('room camera pose', () => {
  it('stands inside the largest matching room and looks along its diagonal', () => {
    const project = createProject('Rooms', 'house')
    const level = project.levels[0]
    if (!level) throw new Error('missing level')
    level.elevation = 2.7
    rect(level, 0, 0, 6, 5)
    rect(level, 10, 0, 13, 2)
    const detected = detectRooms(level)
    level.rooms = detected.map((room) => ({
      key: room.key,
      name: 'Bedroom',
      type: 'bedroom' as const,
      floor: room.floor,
      ceiling: room.ceiling,
    }))
    const pose = roomCameraPose(project, level.id, 'BEDROOM', { eye: 1.6 })
    expect(pose).not.toBeNull()
    if (!pose) return
    const rooms = detectRooms(level)
    const largest = rooms.reduce((best, room) => (room.area > best.area ? room : best))
    expect(largest.area).toBeCloseTo(30)
    const eye = { x: pose.position.x, y: pose.position.z }
    const look = { x: pose.target.x, y: pose.target.z }
    expect(pointInPolygon(eye, largest.polygon)).toBe(true)
    expect(pointInPolygon(look, largest.polygon)).toBe(true)
    expect(edgeGap(eye, largest.polygon)).toBeGreaterThanOrEqual(0.4)
    expect(pose.position.y).toBeCloseTo(4.3)
    expect(pose.target.y).toBeCloseTo(4.3)
    expect(pose.roomName.toLowerCase()).toContain('bedroom')
    expect(roomCameraPose(project, level.id, 'kitchen')).toBeNull()
    expect(roomCameraPose(project, 'missing', 'bedroom')).toBeNull()
  })

  it('places family-house interiors clear of the walls', () => {
    const project = familyHouse()
    const ground = project.levels[0]
    const upper = project.levels.find((level) => level.name === 'Upper')
    if (!ground || !upper) throw new Error('family levels')
    const living = roomCameraPose(project, ground.id, 'living', { eye: 1.6 })
    const kitchen = roomCameraPose(project, ground.id, 'kitchen', { eye: 1.6 })
    const bath = roomCameraPose(project, upper.id, 'bathroom', { eye: 1.6 })
    const bed = roomCameraPose(project, upper.id, 'bedroom', { eye: 1.6 })
    expect(living?.roomName.toLowerCase()).toContain('living')
    expect(kitchen?.roomName.toLowerCase()).toContain('kitchen')
    expect(bath?.roomName.toLowerCase()).toContain('bath')
    expect(bath?.position.y).toBeCloseTo(upper.elevation + 1.6)
    const bedrooms = detectRooms(upper).filter((room) => room.name.toLowerCase().includes('bedroom'))
    const largest = bedrooms.reduce((best, room) => (room.area > best.area ? room : best))
    expect(largest.area).toBeGreaterThan(30)
    if (!bed) throw new Error('missing bedroom pose')
    expect(pointInPolygon({ x: bed.position.x, y: bed.position.z }, largest.polygon)).toBe(true)
    for (const pose of [living, kitchen, bath, bed]) {
      if (!pose) throw new Error('missing pose')
      const level = project.levels.find((item) => item.id === pose.levelId)
      const room = level && detectRooms(level).find((item) => item.name === pose.roomName)
      if (!room) throw new Error(pose.roomName)
      const eye = { x: pose.position.x, y: pose.position.z }
      expect(pointInPolygon(eye, room.polygon)).toBe(true)
      expect(edgeGap(eye, room.polygon)).toBeGreaterThanOrEqual(0.4)
    }
  })
})
