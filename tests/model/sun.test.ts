import { describe, expect, it } from 'vitest'
import { clockAltitude, solarHour, sunPosition } from '../../src/model/sun'
import { sunPhase } from '../../src/model/sunLook'

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

  it('treats the clock as Porto civil time, so late June sunset is about 21:05', () => {
    const lat = 41.15
    const day = 172
    expect(solarHour(day, 12, lat)).toBeLessThan(11)
    expect(clockAltitude(day, 20.6, lat)).toBeGreaterThan(0.04)
    expect(sunPhase(clockAltitude(day, 20.6, lat))).toBe('day')
    let sunset = 24
    for (let hour = 18; hour <= 23; hour += 0.02) {
      if (clockAltitude(day, hour, lat) <= 0) {
        sunset = hour
        break
      }
    }
    expect(sunset).toBeGreaterThan(20.75)
    expect(sunset).toBeLessThan(21.35)
    const deep = clockAltitude(day, 23, lat)
    expect(deep).toBeLessThan((-8 * Math.PI) / 180)
    expect(sunPhase(deep)).toBe('night')
    expect(sunPhase(clockAltitude(day, sunset + 0.2, lat))).toBe('twilight')
    expect(sunPhase(0)).toBe('day')
    expect(sunPhase((-3 * Math.PI) / 180)).toBe('twilight')
    expect(sunPhase((-7 * Math.PI) / 180)).toBe('night')
  })
})
