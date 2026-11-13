export interface FlightPose {
  position: [number, number, number]
  quaternion: [number, number, number, number]
  fov: number
}

function clonePose(pose: FlightPose): FlightPose {
  return {
    position: [pose.position[0], pose.position[1], pose.position[2]],
    quaternion: [pose.quaternion[0], pose.quaternion[1], pose.quaternion[2], pose.quaternion[3]],
    fov: pose.fov,
  }
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}

function slerp(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
  t: number,
): [number, number, number, number] {
  if (t <= 0) return [a[0], a[1], a[2], a[3]]
  if (t >= 1) return [b[0], b[1], b[2], b[3]]
  let bx = b[0]
  let by = b[1]
  let bz = b[2]
  let bw = b[3]
  let dot = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw
  if (dot < 0) {
    bx = -bx
    by = -by
    bz = -bz
    bw = -bw
    dot = -dot
  }
  if (dot > 0.9995) {
    const x = a[0] + (bx - a[0]) * t
    const y = a[1] + (by - a[1]) * t
    const z = a[2] + (bz - a[2]) * t
    const w = a[3] + (bw - a[3]) * t
    const length = Math.hypot(x, y, z, w) || 1
    return [x / length, y / length, z / length, w / length]
  }
  const theta = Math.acos(Math.min(1, dot))
  const s = Math.sin(theta)
  const w1 = Math.sin((1 - t) * theta) / s
  const w2 = Math.sin(t * theta) / s
  return [a[0] * w1 + bx * w2, a[1] * w1 + by * w2, a[2] * w1 + bz * w2, a[3] * w1 + bw * w2]
}

export function segmentDurations(durations: readonly number[], segments: number): number[] {
  const out: number[] = []
  for (let i = 0; i < segments; i++) out.push(Math.max(0.05, durations[i] ?? 4))
  return out
}

export function flightDuration(durations: readonly number[], segments: number): number {
  return segmentDurations(durations, segments).reduce((sum, value) => sum + value, 0)
}

/** Catmull-Rom on position, slerp on orientation. Endpoints match the first and last poses. */
export function sampleFlight(poses: readonly FlightPose[], durations: readonly number[], time: number): FlightPose {
  const count = poses.length
  const first = poses[0]
  if (!first) {
    return { position: [0, 1.6, 0], quaternion: [0, 0, 0, 1], fov: 50 }
  }
  if (count === 1) return clonePose(first)
  const lengths = segmentDurations(durations, count - 1)
  const total = lengths.reduce((sum, value) => sum + value, 0)
  const t = Math.min(Math.max(time, 0), total)
  if (t <= 0) return clonePose(first)
  const last = poses[count - 1]
  if (t >= total && last) return clonePose(last)

  let acc = 0
  let seg = 0
  for (let i = 0; i < lengths.length; i++) {
    const span = lengths[i] ?? 0
    if (t <= acc + span) {
      seg = i
      break
    }
    acc += span
  }
  const span = lengths[seg] || 0.05
  const local = Math.min(1, Math.max(0, (t - acc) / span))
  const p0 = poses[Math.max(0, seg - 1)] ?? first
  const p1 = poses[seg] ?? first
  const p2 = poses[seg + 1] ?? p1
  const p3 = poses[Math.min(count - 1, seg + 2)] ?? p2
  return {
    position: [
      catmull(p0.position[0], p1.position[0], p2.position[0], p3.position[0], local),
      catmull(p0.position[1], p1.position[1], p2.position[1], p3.position[1], local),
      catmull(p0.position[2], p1.position[2], p2.position[2], p3.position[2], local),
    ],
    quaternion: slerp(p1.quaternion, p2.quaternion, local),
    fov: p1.fov + (p2.fov - p1.fov) * local,
  }
}
