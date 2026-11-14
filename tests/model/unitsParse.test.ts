import { describe, expect, it } from 'vitest'
import { formatLengthInput, parseLength, parseSize } from '../../src/model/units'

const FT = 0.3048
const IN = 0.0254

describe('parseLength', () => {
  it('reads metric with units, decimal commas and mixed parts', () => {
    expect(parseLength('3.5 m', 'metric')).toBeCloseTo(3.5)
    expect(parseLength('3,5', 'metric')).toBeCloseTo(3.5)
    expect(parseLength('350cm', 'metric')).toBeCloseTo(3.5)
    expect(parseLength('3500 mm', 'metric')).toBeCloseTo(3.5)
    expect(parseLength('1m 20cm', 'metric')).toBeCloseTo(1.2)
    expect(parseLength('.75', 'metric')).toBeCloseTo(0.75)
  })

  it('reads feet and inches in every common spelling', () => {
    const elevenFour = 11 * FT + 4 * IN
    for (const text of [`11' 4"`, `11'4"`, `11'4`, `11' 4`, `11 ft 4 in`, `11ft4in`, `11' - 4"`, `11’ 4”`]) {
      expect(parseLength(text, 'imperial'), text).toBeCloseTo(elevenFour, 6)
    }
    expect(parseLength(`4 1/2"`, 'imperial')).toBeCloseTo(4.5 * IN, 6)
    expect(parseLength(`1/2"`, 'imperial')).toBeCloseTo(0.5 * IN, 6)
    expect(parseLength(`10.5'`, 'imperial')).toBeCloseTo(10.5 * FT, 6)
    expect(parseLength('132 in', 'imperial')).toBeCloseTo(132 * IN, 6)
  })

  it('honours explicit units whatever the project units are', () => {
    expect(parseLength('3 m', 'imperial')).toBeCloseTo(3)
    expect(parseLength(`10'`, 'metric')).toBeCloseTo(10 * FT)
  })

  it('rejects junk, negatives, zero (unless allowed) and absurd lengths', () => {
    for (const text of ['', ' ', 'abc', '-3', '3 m m', '4 4', '1/0"', '5000']) {
      expect(parseLength(text, 'metric'), text).toBeNull()
    }
    expect(parseLength('0', 'metric', { allowZero: true })).toBe(0)
    expect(parseLength(`0'`, 'imperial', { allowZero: true })).toBe(0)
  })
})

describe('parseSize', () => {
  it('reads width × depth', () => {
    expect(parseSize('4x3', 'metric')).toEqual({ w: 4, d: 3 })
    expect(parseSize('4,5 × 3', 'metric')).toEqual({ w: 4.5, d: 3 })
    const size = parseSize(`13' x 10' 6"`, 'imperial')!
    expect(size.w).toBeCloseTo(13 * FT, 6)
    expect(size.d).toBeCloseTo(10.5 * FT, 6)
    expect(parseSize('4', 'metric')).toBeNull()
    expect(parseSize('4x', 'metric')).toBeNull()
  })
})

describe('formatLengthInput', () => {
  it('round-trips through parseLength', () => {
    for (const metres of [0.2, 0.9, 2.1, 3.455, 11 * FT + 4.5 * IN, 7.3]) {
      for (const units of ['metric', 'imperial'] as const) {
        const text = formatLengthInput(metres, units)
        const back = parseLength(text, units)!
        expect(Math.abs(back - metres), `${units} ${text}`).toBeLessThan(units === 'metric' ? 5e-4 : IN / 16 + 1e-9)
      }
    }
    expect(formatLengthInput(3.455, 'metric')).toBe('3.455 m')
    expect(formatLengthInput(11 * FT + 4.5 * IN, 'imperial')).toBe(`11' 4 1/2"`)
    expect(formatLengthInput(8 * IN, 'imperial')).toBe(`0' 8"`)
  })
})
