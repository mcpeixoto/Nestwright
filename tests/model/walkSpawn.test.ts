import { describe, expect, it } from 'vitest'
import { createProject, createWall } from '../../src/model/defaults'
import { placeOpening } from '../../src/model/ops'
import { walkSpawn } from '../../src/model/walkSpawn'

function square() {
  const project = createProject('Box', 'house')
  const level = project.levels[0]
  if (!level) throw new Error('missing level')
  const points = [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 6, y: 4 },
    { x: 0, y: 4 },
  ]
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (a && b) level.walls.push(createWall(a, b))
  }
  return { project, level }
}

describe('walkSpawn', () => {
  it('stands 2 m outside the south door, facing it', () => {
    const { project, level } = square()
    const south = level.walls.find((wall) => wall.a.y === 0 && wall.b.y === 0)
    expect(south).toBeTruthy()
    if (!south) return
    expect(placeOpening(level, 'door', south.id, 3)).toBeTruthy()
    const spawn = walkSpawn(project)
    expect(spawn.y).toBeCloseTo(1.65)
    expect(spawn.x).toBeCloseTo(3, 0)
    expect(spawn.z).toBeLessThan(-1.5)
    expect(Math.abs(Math.atan2(Math.sin(spawn.yaw - Math.PI), Math.cos(spawn.yaw - Math.PI)))).toBeLessThan(0.2)
  })

  it('uses the largest room centroid at eye height when there is no door', () => {
    const { project } = square()
    const spawn = walkSpawn(project)
    expect(spawn.x).toBeCloseTo(3, 0)
    expect(spawn.z).toBeCloseTo(2, 0)
    expect(spawn.y).toBeCloseTo(1.65)
    expect(Number.isFinite(spawn.yaw)).toBe(true)
  })
})
