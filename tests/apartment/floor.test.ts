import { describe, expect, it } from 'vitest'
import { elevationForFloor, floorNumber } from '../../src/apartment/floor'

describe('floor number', () => {
  it('turns a storey into an elevation and ignores non-finite input', () => {
    expect(floorNumber(9)).toBe(3)
    expect(elevationForFloor(4)).toBe(12)
    expect(floorNumber(Number.NaN)).toBe(0)
    expect(elevationForFloor(Number.POSITIVE_INFINITY)).toBe(0)
  })
})
