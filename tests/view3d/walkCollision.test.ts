import { describe, expect, it } from 'vitest'
import { moveCircle, solidSegments, type ThickSegment } from '../../src/model/collision'
import { createLevel, createProject, createWall, mat } from '../../src/model/defaults'
import { ceilingAt, headroomBlocked } from '../../src/model/headroom'
import { placeOpening } from '../../src/model/ops'
import { clampOrbitTarget, easeTarget } from '../../src/model/orbitClamp'
import type { Level, Stair } from '../../src/model/types'

function box(level: Level): void {
  const pts = [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 6, y: 5 },
    { x: 0, y: 5 },
  ]
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    if (a && b) level.walls.push(createWall(a, b))
  }
}

describe('walk capsule', () => {
  it('a 0.3 m body cannot pass a 0.5 m gap between two walls', () => {
    const gapX = 2
    const segs: ThickSegment[] = [
      { a: { x: gapX, y: -5 }, b: { x: gapX, y: -0.25 }, halfWidth: 0.1 },
      { a: { x: gapX, y: 0.25 }, b: { x: gapX, y: 5 }, halfWidth: 0.1 },
    ]
    const end = moveCircle({ x: 0, y: 0 }, 0.3, { x: 4, y: 0 }, segs)
    expect(end.x).toBeLessThan(gapX - 0.3 + 1e-3)
  })

  it('a 0.3 m body passes a 0.9 m door', () => {
    const project = createProject('Door', 'house')
    const level = project.levels[0]!
    const wall = createWall({ x: 0, y: 0 }, { x: 6, y: 0 })
    level.walls.push(wall)
    const door = placeOpening(level, 'door', wall.id, 3)
    expect(door).toBeTruthy()
    if (door) door.width = 0.9
    const segs = solidSegments(wall, level.openings)
    const end = moveCircle({ x: 3, y: -1 }, 0.3, { x: 0, y: 2 }, segs)
    expect(end.y).toBeGreaterThan(0)
  })

  it('headroom blocks under a low slab and not under a stair hole', () => {
    const project = createProject('Low', 'house')
    const ground = project.levels[0]!
    box(ground)
    const upper = createLevel('Upper', 1.2)
    box(upper)
    project.levels.push(upper)
    expect(headroomBlocked(project, ground.id, 3, 2, 0)).toBe(true)
    const stair: Stair = {
      id: 'stair-1',
      shape: 'straight',
      position: { x: 2.9, y: 2 },
      rotation: 0,
      width: 1,
      rise: 1.2,
      material: mat('wood'),
      railing: false,
    }
    ground.stairs.push(stair)
    expect(headroomBlocked(project, ground.id, 3, 2, 0)).toBe(false)
  })

  it('headroom is open outdoors', () => {
    const project = createProject('Out', 'house')
    const ground = project.levels[0]!
    box(ground)
    const upper = createLevel('Upper', 2.7)
    box(upper)
    project.levels.push(upper)
    expect(ceilingAt(project, ground.id, 10, 10, 0)).toBeNull()
  })
})

describe('orbit target', () => {
  it('clampOrbitTarget holds x/z inside bounds + margin and y inside the level', () => {
    const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 6, y: 2.7, z: 5 } }
    expect(clampOrbitTarget({ x: 20, y: -3, z: 2 }, bounds)).toEqual({ x: 9, y: 0, z: 2 })
  })

  it('easeTarget converges', () => {
    let p = { x: 0, y: 0, z: 0 }
    const goal = { x: 10, y: 0, z: 0 }
    for (let i = 0; i < 30; i++) {
      p = easeTarget(p, goal, 1 / 60)
      expect(p.x).toBeLessThanOrEqual(10)
    }
    expect(Math.abs(p.x - 10)).toBeLessThan(0.1)
  })
})
