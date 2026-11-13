import { describe, expect, it } from 'vitest'
import { levelToOpen } from '../../src/model/openLevel'
import { beachHouse } from '../../src/templates/beach'
import { familyHouse } from '../../src/templates/family'

describe('levelToOpen', () => {
  it('opens the beach house on the main floor, not the stilts', () => {
    const project = beachHouse()
    const id = levelToOpen(project)
    const level = project.levels.find((item) => item.id === id)
    expect(level?.name).toBe('House')
    expect(level?.elevation).toBeGreaterThan(0)
  })

  it('opens the family house on the ground floor', () => {
    const project = familyHouse()
    const id = levelToOpen(project)
    const level = project.levels.find((item) => item.id === id)
    expect(level?.name).toBe('Ground')
    expect(level?.elevation).toBe(0)
  })
})
