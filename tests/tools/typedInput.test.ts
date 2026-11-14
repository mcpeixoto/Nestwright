import { describe, expect, it } from 'vitest'
import { axisSign, typedCorner, typeKey } from '../../src/tools/typedInput'

function feed(keys: string, size = false): string {
  let buffer = ''
  for (const key of keys) buffer = typeKey(buffer, key, size) ?? buffer
  return buffer
}

describe('typeKey', () => {
  it('lets letters through to shortcuts when nothing is typed', () => {
    expect(typeKey('', 'w')).toBeNull()
    expect(typeKey('', 'm')).toBeNull()
    expect(typeKey('', ' ')).toBeNull()
    expect(typeKey('', '3')).toBe('3')
    expect(typeKey('', "'")).toBe("'")
  })

  it('collects metric and imperial lengths', () => {
    expect(feed('350 cm')).toBe('350 cm')
    expect(feed(`11' 4 1/2"`)).toBe(`11' 4 1/2"`)
    expect(feed('3,5m')).toBe('3,5m')
  })

  it('accepts one size separator only in size mode', () => {
    expect(feed('4x3', true)).toBe('4x3')
    expect(feed('4x3x2', true)).toBe('4x32')
    expect(feed('4x3')).toBe('43')
  })

  it('ignores modifier names and caps the length', () => {
    expect(typeKey('3', 'Shift')).toBeNull()
    expect(typeKey('1'.repeat(28), '1')).toBeNull()
  })

  it('picks the drag direction per axis', () => {
    expect(axisSign(2, 1)).toBe(-1)
    expect(axisSign(2, 2)).toBe(1)
    expect(axisSign(2, 5)).toBe(1)
  })

  it('puts a typed room toward the pointer', () => {
    expect(typedCorner({ x: 1, y: 1 }, { x: 0, y: 5 }, { w: 4, d: 3 })).toEqual({ x: -3, y: 4 })
    expect(typedCorner({ x: 1, y: 1 }, { x: 1, y: 1 }, { w: 4, d: 3 })).toEqual({ x: 5, y: 4 })
  })
})
