import { moveCircle, type Footprint, type ThickSegment } from './collision'
import type { Vec2 } from './types'

export interface WalkInput {
  x: number
  y: number
  /** Radians, matching the walk camera's yaw. 0 looks toward plan -y. */
  yaw: number
  /** +1 forward, -1 back. */
  forward: number
  /** +1 right, -1 left. */
  strafe: number
  speed: number
  dt: number
  radius: number
  segments: readonly ThickSegment[]
  footprints?: readonly Footprint[]
}

/**
 * One integration step of first-person movement. `dt` is clamped the same way
 * the walk rig clamps a frame, so a hitch cannot tunnel through a wall.
 */
export function integrateWalk(input: WalkInput): Vec2 {
  const step = Math.min(0.05, Math.max(0, input.dt))
  const sin = Math.sin(input.yaw)
  const cos = Math.cos(input.yaw)
  const dx = (-sin * input.forward + cos * input.strafe) * input.speed * step
  const dy = (-cos * input.forward - sin * input.strafe) * input.speed * step
  return moveCircle(
    { x: input.x, y: input.y },
    input.radius,
    { x: dx, y: dy },
    input.segments,
    input.footprints ?? [],
  )
}
