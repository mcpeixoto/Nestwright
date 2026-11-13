import { describe, expect, it } from 'vitest'
import { flightDuration, sampleFlight, type FlightPose } from '../../src/view3d/flight'

const a: FlightPose = { position: [0, 1, 0], quaternion: [0, 0, 0, 1], fov: 40 }
const b: FlightPose = { position: [10, 3, 4], quaternion: [0, 0.70710678, 0, 0.70710678], fov: 60 }
const c: FlightPose = { position: [3, 5, -2], quaternion: [0, 1, 0, 0], fov: 28 }

describe('flight interpolation', () => {
  it('matches the first and last poses at the endpoints', () => {
    const durations = [2, 4]
    const total = flightDuration(durations, 2)
    const start = sampleFlight([a, b, c], durations, 0)
    const end = sampleFlight([a, b, c], durations, total)
    expect(start.position[0]).toBeCloseTo(a.position[0])
    expect(start.position[1]).toBeCloseTo(a.position[1])
    expect(start.position[2]).toBeCloseTo(a.position[2])
    expect(start.quaternion[3]).toBeCloseTo(1)
    expect(start.fov).toBeCloseTo(40)
    expect(end.position[0]).toBeCloseTo(c.position[0])
    expect(end.position[1]).toBeCloseTo(c.position[1])
    expect(end.position[2]).toBeCloseTo(c.position[2])
    expect(end.fov).toBeCloseTo(28)
    expect(end.quaternion[1]).toBeCloseTo(1)
  })

  it('lands on the second pose at the end of a single segment', () => {
    const end = sampleFlight([a, b], [5], 5)
    const start = sampleFlight([a, b], [5], 0)
    expect(start.fov).toBeCloseTo(40)
    expect(end.position[0]).toBeCloseTo(10)
    expect(end.fov).toBeCloseTo(60)
  })
})
