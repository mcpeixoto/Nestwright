import { describe, expect, it } from 'vitest'
import { clampKelvin, kelvinToHex } from '../../src/model/light'

function blue(hex: string): number {
  return Number.parseInt(hex.slice(5, 7), 16)
}

describe('light', () => {
  it('shifts from warm to cool across the lamp range', () => {
    const warm = kelvinToHex(2200)
    const cool = kelvinToHex(6500)
    expect(blue(warm)).toBeLessThan(blue(cool))
    expect(clampKelvin(100)).toBe(2200)
    expect(clampKelvin(9000)).toBe(6500)
    expect(clampKelvin(Number.NaN)).toBe(2700)
  })
})
