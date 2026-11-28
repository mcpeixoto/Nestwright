import { describe, expect, it } from 'vitest'
import { en } from '../../src/i18n/en'

const has = (key: string) => Object.prototype.hasOwnProperty.call(en, key)

describe('plain-language vocabulary', () => {
  it('drops the jargon keys', () => {
    const removed = ['Joints', 'Slab', 'Plot', 'Sculpt', 'Calibrate trace', 'Variants', 'Wishes', 'Together', 'Render scale', 'Tone mapping', 'Exposure compensation', 'Renderer (applies on restart)']
    expect(removed.filter(has)).toEqual([])
  })

  it('has the everyday words', () => {
    const added = ['Floor slab', 'Garden boundary', 'Shape ground', 'Set scale', 'Options A/B', 'Wish list', 'Play together', 'Colour look', 'Brightness', 'Graphics engine (restart needed)']
    expect(added.filter((key) => !has(key))).toEqual([])
  })
})
