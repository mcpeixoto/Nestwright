import { describe, expect, it } from 'vitest'
import { chainExtend, chainFinish, chainPointerDown, initialChain } from '../../src/tools/wallChain'

describe('wall chain', () => {
  it('keeps fast clicks that land on different points', () => {
    let state = initialChain()
    const clicks = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ]
    let committed = null as { x: number; y: number }[] | null
    clicks.forEach((point, index) => {
      const step = chainPointerDown(state, point, 1_000 + index * 80)
      state = step.state
      committed = step.commit
    })
    expect(committed).toBeNull()
    expect(state.points).toEqual(clicks)
  })

  it('commits on a double-click that stays on the same spot', () => {
    let state = initialChain()
    state = chainPointerDown(state, { x: 0, y: 0 }, 1_000).state
    state = chainPointerDown(state, { x: 3, y: 0 }, 1_400).state
    const step = chainPointerDown(state, { x: 3.05, y: 0.02 }, 1_600)
    expect(step.commit).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ])
    expect(step.state.points).toEqual([])
    const ignored = chainPointerDown(step.state, { x: 5, y: 5 }, 1_700)
    expect(ignored.commit).toBeNull()
    expect(ignored.state.points).toEqual([])
  })

  it('closes the loop when a later click hits the start', () => {
    let state = initialChain()
    for (const [point, time] of [
      [{ x: 0, y: 0 }, 5_000],
      [{ x: 4, y: 0 }, 6_000],
      [{ x: 4, y: 4 }, 7_000],
    ] as const) {
      state = chainPointerDown(state, point, time).state
    }
    const step = chainPointerDown(state, { x: 0.01, y: 0 }, 8_000)
    expect(step.commit?.[0]).toEqual({ x: 0, y: 0 })
    expect(step.commit?.[step.commit.length - 1]).toEqual({ x: 0, y: 0 })
    expect(step.commit).toHaveLength(4)
  })

  it('ignores a click on the point just placed and extends by a typed length', () => {
    let state = chainPointerDown(initialChain(), { x: 1, y: 1 }, 1_000).state
    const again = chainPointerDown(state, { x: 1.01, y: 1 }, 2_000)
    expect(again.commit).toBeNull()
    expect(again.state.points).toHaveLength(1)
    state = chainExtend(again.state, { x: 1, y: 4 }, 2)
    expect(state.points[1]?.x).toBeCloseTo(1)
    expect(state.points[1]?.y).toBeCloseTo(3)
    const done = chainFinish(state, 3_000)
    expect(done.commit).toHaveLength(2)
    expect(chainFinish(initialChain(), 4_000).commit).toBeNull()
  })
})