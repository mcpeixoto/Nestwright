import { describe, expect, it } from 'vitest'
import { levelAreas, projectAreas, roomNetArea, roomNetPolygon } from '../../src/model/areas'
import { createLevel, createProject } from '../../src/model/defaults'
import { addWallChain } from '../../src/model/ops'
import { detectRooms } from '../../src/model/rooms'
import type { Vec2 } from '../../src/model/types'

function ring(points: Vec2[]): Vec2[] {
  return [...points, points[0]!]
}

function boxLevel(thickness = 0.2) {
  const level = createLevel('G', 0)
  addWallChain(
    level,
    ring([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ]),
    { thickness },
  )
  return level
}

describe('net floor area', () => {
  it('measures a rectangle inside its wall faces', () => {
    const level = boxLevel(0.2)
    const [room] = detectRooms(level)
    expect(room!.area).toBeCloseTo(12, 6)
    expect(roomNetArea(level, room!)).toBeCloseTo(3.8 * 2.8, 6)
    const xs = roomNetPolygon(level, room!).map((p) => p.x)
    expect(Math.min(...xs)).toBeCloseTo(0.1, 6)
    expect(Math.max(...xs)).toBeCloseTo(3.9, 6)
  })

  it('insets each side by its own wall thickness', () => {
    const level = boxLevel(0.2)
    const bottom = level.walls.find((w) => Math.abs(w.a.y) < 1e-6 && Math.abs(w.b.y) < 1e-6)!
    bottom.thickness = 0.4
    const [room] = detectRooms(level)
    // Bottom face at y = 0.2, top at 2.9, sides at 0.1 and 3.9.
    expect(roomNetArea(level, room!)).toBeCloseTo(3.8 * 2.7, 6)
  })

  it('splits a partition between the two rooms it divides', () => {
    const level = boxLevel(0.2)
    addWallChain(
      level,
      [
        { x: 2, y: 0 },
        { x: 2, y: 3 },
      ],
      { thickness: 0.1 },
    )
    const rooms = detectRooms(level)
    expect(rooms).toHaveLength(2)
    for (const room of rooms) expect(roomNetArea(level, room)).toBeCloseTo((2 - 0.1 - 0.05) * 2.8, 6)
    const totals = levelAreas(level)
    expect(totals.net).toBeCloseTo(2 * 1.85 * 2.8, 6)
    expect(totals.gross).toBeCloseTo(12, 6)
    expect(totals.rooms).toBe(2)
  })

  it('handles an L-shaped room', () => {
    const level = createLevel('G', 0)
    addWallChain(
      level,
      ring([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 2 },
        { x: 2, y: 2 },
        { x: 2, y: 4 },
        { x: 0, y: 4 },
      ]),
      { thickness: 0.2 },
    )
    const [room] = detectRooms(level)
    expect(room!.area).toBeCloseTo(12, 6)
    // Inner L: 3.8 x 1.8 bottom strip plus 1.8 x 2.0 upright (from y 1.9 to 3.9).
    expect(roomNetArea(level, room!)).toBeCloseTo(3.8 * 1.8 + 1.8 * 2.0, 6)
  })

  it('stays below the centre-line area for a curved wall', () => {
    const level = boxLevel(0.2)
    const top = level.walls.find((w) => Math.abs(w.a.y - 3) < 1e-6 && Math.abs(w.b.y - 3) < 1e-6)!
    top.bulge = 0.6
    const [room] = detectRooms(level)
    const net = roomNetArea(level, room!)
    expect(net).toBeLessThan(room!.area)
    expect(net).toBeGreaterThan(room!.area - 0.2 * 4 * 2)
  })

  it('counts balconies and terraces apart, and sums every level', () => {
    const project = createProject('Test', 'house')
    const ground = boxLevel(0.2)
    const upper = boxLevel(0.2)
    const [balcony] = detectRooms(upper)
    upper.rooms.push({ key: balcony!.key, name: 'Balcony', type: 'balcony', floor: { id: 'oak-planks' }, ceiling: { id: 'plaster-white' } })
    project.levels = [ground, upper]
    const totals = projectAreas(project)
    expect(totals.net).toBeCloseTo(10.64, 6)
    expect(totals.outdoor).toBeCloseTo(10.64, 6)
    expect(totals.rooms).toBe(1)
  })
})
