import { describe, expect, it } from 'vitest'
import { en } from '../../src/i18n/en'
import { pt } from '../../src/i18n/pt'

describe('dictionaries', () => {
  it('uses the same keys in English and European Portuguese', () => {
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort())
  })
})
