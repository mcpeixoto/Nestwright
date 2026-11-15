import { describe, expect, it } from 'vitest'
import { BRIEFS } from '../../../src/model/briefs'

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const BRAZILIAN = ['banheiro', 'geladeira', 'ônibus', 'onibus', 'você', 'voce', 'sobrado', 'lavanderia', 'gramado']

describe('brief catalog', () => {
  it('lists 12 briefs with unique ids and orders 1 through 12', () => {
    expect(BRIEFS).toHaveLength(12)
    const ids = BRIEFS.map((brief) => brief.id)
    const orders = BRIEFS.map((brief) => brief.order).sort((a, b) => a - b)
    expect(new Set(ids).size).toBe(12)
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    for (const id of ids) expect(id).toMatch(KEBAB)
  })

  it('writes a non-empty European Portuguese string that is not a copy of the English', () => {
    for (const brief of BRIEFS) {
      for (const text of [brief.title, brief.summary]) {
        expect(text.en.trim().length).toBeGreaterThan(0)
        expect(text.pt.trim().length).toBeGreaterThan(0)
        expect(text.pt).not.toBe(text.en)
        const pt = text.pt.toLowerCase()
        for (const word of BRAZILIAN) expect(pt).not.toContain(word)
      }
    }
  })

  it('keeps every brief buildable: room minimums fit the floor-area cap, plots and slopes are sane', () => {
    for (const brief of BRIEFS) {
      expect(brief.plot.width).toBeGreaterThan(0)
      expect(brief.plot.depth).toBeGreaterThan(0)
      if (brief.plot.slope != null) {
        expect(brief.plot.slope).toBeGreaterThanOrEqual(0)
        expect(brief.plot.slope).toBeLessThanOrEqual(0.25)
      }
      if (brief.budget != null) expect(brief.budget).toBeGreaterThan(0)
      if (brief.levels?.min != null && brief.levels.max != null) {
        expect(brief.levels.min).toBeLessThanOrEqual(brief.levels.max)
      }
      expect(brief.rooms.length).toBeGreaterThan(0)
      let minimum = 0
      for (const room of brief.rooms) {
        expect(room.count).toBeGreaterThan(0)
        if (room.minArea != null) {
          expect(room.minArea).toBeGreaterThan(0)
          minimum += room.minArea * room.count
        }
      }
      if (brief.maxFloorArea != null) {
        expect(brief.maxFloorArea).toBeGreaterThan(0)
        expect(minimum).toBeLessThanOrEqual(brief.maxFloorArea)
      }
      if (brief.minFloorArea != null && brief.maxFloorArea != null) {
        expect(brief.minFloorArea).toBeLessThanOrEqual(brief.maxFloorArea)
      }
    }
  })
})
