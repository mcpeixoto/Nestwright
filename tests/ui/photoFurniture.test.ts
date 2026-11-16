import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PHOTO_SIZE,
  mergePhotos,
  nameFromFile,
  placementPoint,
  progressPercent,
  runBlock,
  sizeValid,
} from '../../src/ui/photoFurniture'

const ready = { available: true, configured: true, photos: 2, size: DEFAULT_PHOTO_SIZE, phase: 'pick' as const }

describe('photo furniture view-model', () => {
  it('names the item after the first photo', () => {
    expect(nameFromFile('IMG_2041-sofa.HEIC')).toBe('IMG 2041 sofa')
    expect(nameFromFile('/Users/me/Pictures/armchair.jpg')).toBe('armchair')
  })

  it('says why Make 3D model cannot run', () => {
    expect(runBlock(ready)).toBeNull()
    expect(runBlock({ ...ready, available: false })).toBe('web')
    expect(runBlock({ ...ready, configured: false })).toBe('no-converter')
    expect(runBlock({ ...ready, photos: 0 })).toBe('no-photos')
    expect(runBlock({ ...ready, photos: 4 })).toBe('too-many')
    expect(runBlock({ ...ready, size: { w: 0, d: 1, h: 1 } })).toBe('size')
    expect(runBlock({ ...ready, phase: 'running' })).toBe('busy')
  })

  it('validates sizes between 5 cm and 6 m', () => {
    expect(sizeValid({ w: 0.05, d: 6, h: 1 })).toBe(true)
    expect(sizeValid({ w: 7, d: 1, h: 1 })).toBe(false)
    expect(sizeValid({ w: Number.NaN, d: 1, h: 1 })).toBe(false)
  })

  it('clamps progress to whole percent', () => {
    expect(progressPercent(0.426)).toBe(43)
    expect(progressPercent(2)).toBe(100)
    expect(progressPercent(Number.NaN)).toBe(0)
  })

  it('adds picks without duplicates, up to three', () => {
    const a = { path: '/a.jpg' }
    const b = { path: '/b.jpg' }
    const c = { path: '/c.jpg' }
    const d = { path: '/d.jpg' }
    expect(mergePhotos([a], [a, b])).toEqual([a, b])
    expect(mergePhotos([a, b], [c, d])).toEqual([a, b, c])
  })

  it('places at the centre of the visible plan, else of the walls, else the origin', () => {
    expect(placementPoint({ minX: 0, minY: 0, maxX: 10, maxY: 6 }, [])).toEqual({ x: 5, y: 3 })
    const walls = [
      { a: { x: 2, y: 2 }, b: { x: 8, y: 2 } },
      { a: { x: 8, y: 2 }, b: { x: 8, y: 6 } },
    ]
    expect(placementPoint(null, walls)).toEqual({ x: 5, y: 4 })
    expect(placementPoint({ minX: 1, minY: 1, maxX: 1, maxY: 1 }, [])).toEqual({ x: 0, y: 0 })
  })
})
