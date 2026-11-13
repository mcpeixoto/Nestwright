import { describe, expect, it } from 'vitest'
import { formatArea, formatLength } from '../../src/model/units'

describe('units', () => {
  it('formats metric length and area', () => {
    expect(formatLength(3.45, 'metric')).toBe('3.45 m')
    expect(formatLength(3, 'metric')).toBe('3 m')
    expect(formatArea(12.3, 'metric')).toBe('12.3 m²')
    expect(formatArea(16, 'metric')).toBe('16 m²')
  })

  it('formats imperial length and area', () => {
    const elevenFour = 11 * 0.3048 + 4 * 0.0254
    expect(formatLength(elevenFour, 'imperial')).toBe(`11' 4"`)
    const metres = 132 / 10.763910416709722
    expect(formatArea(metres, 'imperial')).toBe('132 ft²')
  })
})
