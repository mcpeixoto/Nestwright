import { describe, expect, it } from 'vitest'
import { BRIEFS, totalStars, unlockedBriefs } from '../../../src/model/briefs'

const ordered = [...BRIEFS].sort((a, b) => a.order - b.order)

describe('brief progress', () => {
  it('unlocks the first brief with no stars, then the next only after one star', () => {
    expect(unlockedBriefs({})).toEqual([ordered[0]!.id])
    expect(unlockedBriefs({ [ordered[0]!.id]: 0 })).toEqual([ordered[0]!.id])
    expect(unlockedBriefs({ [ordered[0]!.id]: 1 })).toEqual([ordered[0]!.id, ordered[1]!.id])

    const through = (count: number) => {
      const stars: Record<string, number> = {}
      for (let i = 0; i < count - 1; i++) stars[ordered[i]!.id] = 1
      return unlockedBriefs(stars)
    }
    expect(through(12)).toEqual(ordered.map((brief) => brief.id))

    const first = ordered[0]!.id
    const second = ordered[1]!.id
    const third = ordered[2]!.id
    expect(unlockedBriefs({ [first]: 3, [third]: 3 })).toEqual([first, second])
  })

  it('sums stars across the catalog and ignores unknown ids', () => {
    expect(totalStars({})).toBe(0)
    const first = ordered[0]!.id
    const second = ordered[1]!.id
    expect(totalStars({ [first]: 3, [second]: 2, 'not-a-brief': 3 })).toBe(5)
    const all: Record<string, number> = {}
    for (const brief of BRIEFS) all[brief.id] = 3
    expect(totalStars(all)).toBe(36)
  })
})
