import { describe, expect, it } from 'vitest'
import { closestPointOnSegment, dist, lerp, pointInPolygon } from '../../src/model/geometry'
import { roomCameraPose } from '../../src/model/roomCamera'
import { computeStairSteps } from '../../src/model/stairs'
import type { Vec2 } from '../../src/model/types'
import { familyHouse } from '../../src/templates'

function gapToPolygon(point: Vec2, polygon: readonly Vec2[]): number {
  if (pointInPolygon(point, polygon)) return 0
  let best = Infinity
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    if (!a || !b) continue
    best = Math.min(best, dist(point, closestPointOnSegment(point, a, b).point))
  }
  return best
}

describe('room camera and stairs', () => {
  it('does not look straight into a nearby stair railing (family kitchen)', () => {
    const project = familyHouse()
    const ground = project.levels.find((level) => level.name === 'Ground')
    if (!ground) throw new Error('missing ground level')
    expect(ground.stairs.length).toBeGreaterThan(0)
    const pose = roomCameraPose(project, ground.id, 'Kitchen')
    if (!pose) throw new Error('no kitchen pose')
    const eye = { x: pose.position.x, y: pose.position.z }
    const look = { x: pose.target.x, y: pose.target.z }
    const treads = ground.stairs.flatMap((stair) => computeStairSteps(stair, ground.height).steps.map((step) => step.polygon))
    const length = dist(eye, look)
    for (let travelled = 0; travelled <= Math.min(2.5, length); travelled += 0.1) {
      const point = lerp(eye, look, travelled / length)
      for (const polygon of treads) expect(gapToPolygon(point, polygon)).toBeGreaterThanOrEqual(0.3)
    }
  })
})
