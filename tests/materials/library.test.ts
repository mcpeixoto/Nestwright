import { describe, expect, it } from 'vitest'
import { getMaterial } from '../../src/materials/materialCache'
import { MATERIALS, getMaterialDef } from '../../src/materials/library'

describe('materials', () => {
  it('resolves every library id', () => {
    expect(new Set(MATERIALS.map((material) => material.id)).size).toBe(MATERIALS.length)
    for (const material of MATERIALS) {
      expect(getMaterialDef(material.id)?.id).toBe(material.id)
      const built = getMaterial({ id: material.id })
      expect(built).toBeTruthy()
    }
  })
})
