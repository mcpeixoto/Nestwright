import { describe, expect, it } from 'vitest'
import { sunPosition } from '../../src/model/sun'

describe('sun', () => {
  it('puts the summer noon sun in the south, high, for a northern latitude', () => {
    const noon = sunPosition(172, 12, 41.15)
    expect(noon.altitude).toBeGreaterThan((60 * Math.PI) / 180)
    expect(noon.altitude).toBeLessThan((85 * Math.PI) / 180)
    expect(Math.abs(noon.azimuth - Math.PI)).toBeLessThan(0.05)
  })

  it('is lower in the morning and symmetric about noon', () => {
    const morning = sunPosition(172, 9, 41.15)
    const afternoon = sunPosition(172, 15, 41.15)
    const noon = sunPosition(172, 12, 41.15)
    expect(morning.altitude).toBeLessThan(noon.altitude)
    expect(afternoon.altitude).toBeCloseTo(morning.altitude, 5)
    expect(morning.azimuth).toBeLessThan(Math.PI)
    expect(afternoon.azimuth).toBeGreaterThan(Math.PI)
    expect(morning.azimuth + afternoon.azimuth).toBeCloseTo(Math.PI * 2, 4)
  })

  it('is below the horizon at midnight', () => {
    expect(sunPosition(172, 0, 41.15).altitude).toBeLessThan(0)
  })
})
