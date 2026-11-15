import { describe, expect, it } from 'vitest'
import { celebrationPlan } from '../../src/ui/celebratePlan'

const BRAND = ['#e8b86d', '#3fb8af', '#f4f0e6', '#e7e1d6']

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('celebration', () => {
  it('drops the particles when reduced motion is on and keeps a full burst otherwise', () => {
    expect(celebrationPlan('unlock', true).particles).toEqual([])
    expect(celebrationPlan('room-complete', true, mulberry32(1)).particles).toEqual([])
    expect(celebrationPlan('unlock', true).anchor).toBe('top-right')
    expect(celebrationPlan('room-complete', true).anchor).toBe('bottom-center')

    for (let seed = 1; seed <= 24; seed++) {
      const unlock = celebrationPlan('unlock', false, mulberry32(seed))
      const room = celebrationPlan('room-complete', false, mulberry32(seed + 100))
      expect(unlock.anchor).toBe('top-right')
      expect(room.anchor).toBe('bottom-center')
      for (const plan of [unlock, room]) {
        expect(plan.particles.length).toBeGreaterThanOrEqual(12)
        expect(plan.particles.length).toBeLessThanOrEqual(20)
        for (const bit of plan.particles) {
          expect(bit.dur).toBeGreaterThan(0)
          expect(bit.dur).toBeLessThanOrEqual(1.2)
          expect(BRAND).toContain(bit.color)
        }
      }
    }
  })
})
