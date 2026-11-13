import { describe, expect, it } from 'vitest'
import { tourProgress, type TourSnap } from '../../src/ui/onboarding/logic'

function snap(partial: Partial<TourSnap> = {}): TourSnap {
  return { walls: 0, rooms: 0, doors: 0, sofas: 0, view: '2d', seenWalk: false, ...partial }
}

describe('tourProgress', () => {
  it('advances when walls appear', () => {
    const baseline = snap()
    expect(tourProgress(0, snap(), baseline)).toBe(0)
    expect(tourProgress(0, snap({ walls: 1 }), baseline)).toBe(1)
  })

  it('counts a closed room in the same edit as the walls', () => {
    const baseline = snap()
    expect(tourProgress(0, snap({ walls: 4, rooms: 1 }), baseline)).toBe(2)
  })

  it('advances when the view becomes 3D', () => {
    const baseline = snap({ walls: 4, rooms: 1 })
    expect(tourProgress(2, snap({ walls: 4, rooms: 1, view: '3d' }), baseline)).toBe(3)
  })

  it('chains a door, a sofa, and walking', () => {
    const baseline = snap({ walls: 4, rooms: 1, view: '3d' })
    const now = snap({ walls: 4, rooms: 1, doors: 1, sofas: 1, view: 'walk' })
    expect(tourProgress(3, now, baseline)).toBe(6)
  })

  it('finishes the walk step when walking was already the view', () => {
    const baseline = snap({ view: 'walk', seenWalk: true })
    expect(tourProgress(5, snap({ view: 'walk', seenWalk: true }), baseline)).toBe(6)
  })
})
