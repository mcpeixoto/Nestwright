import { describe, expect, it } from 'vitest'
import { createLevel, createProject, createWall } from '../../src/model/defaults'
import type { Project } from '../../src/model/types'
import { cascadeBreaks, cascadeDue, cascadeRefresh, cascadeTuning, holdOrSnap, sunShadowTier } from '../../src/view3d/lighting/cascades'
import { PLOT_MARGIN, shadowFocus } from '../../src/view3d/lighting/focus'
import { assignLampSlots, type LampCandidate } from '../../src/view3d/lighting/lampPool'

function ascending(values: number[]): boolean {
  return values.every((v, i) => i === 0 || v > (values[i - 1] ?? -Infinity))
}

describe('cascadeBreaks', () => {
  it('returns one ascending break per cascade ending at 1', () => {
    for (const cascades of [1, 2, 3, 4]) {
      const breaks = cascadeBreaks({ cascades, near: 0.2, far: 120 })
      expect(breaks).toHaveLength(cascades)
      expect(breaks[breaks.length - 1]).toBe(1)
      expect(ascending(breaks)).toBe(true)
    }
  })

  it('keeps the first cascade tight with the practical split', () => {
    const breaks = cascadeBreaks({ cascades: 3, near: 0.2, far: 120 })
    const first = (breaks[0] ?? 1) * 120
    expect(first).toBeLessThan(15)
    expect(first).toBeGreaterThan(2)
  })

  it('spreads from the nearest content for a distant camera', () => {
    const near = cascadeBreaks({ cascades: 3, near: 0.2, far: 120 })
    const aerial = cascadeBreaks({ cascades: 3, near: 0.2, far: 120, start: 30 })
    expect((aerial[0] ?? 0) * 120).toBeGreaterThan(30)
    expect(aerial[0] ?? 0).toBeGreaterThan(near[0] ?? 0)
  })

  it('fits every cascade but the last inside the room indoors', () => {
    const breaks = cascadeBreaks({ cascades: 3, near: 0.2, far: 60, focus: 7 })
    expect((breaks[1] ?? 0) * 60).toBeCloseTo(7, 5)
    expect((breaks[0] ?? 1) * 60).toBeLessThan(7)
    expect(breaks[2]).toBe(1)
    const low = cascadeBreaks({ cascades: 2, near: 0.2, far: 60, focus: 7 })
    expect((low[0] ?? 0) * 60).toBeCloseTo(7, 5)
  })

  it('survives bad input', () => {
    const breaks = cascadeBreaks({ cascades: 3, near: Number.NaN, far: -5, start: Number.NaN })
    expect(breaks).toHaveLength(3)
    expect(breaks.every((b) => Number.isFinite(b))).toBe(true)
  })
})

describe('cascadeDue', () => {
  it('renders the first cascade every frame and staggers the rest', () => {
    for (const count of [2, 3, 4]) {
      let renders = 0
      for (let frame = 0; frame < 8; frame++) {
        expect(cascadeDue(0, count, frame)).toBe(true)
        let due = 0
        for (let i = 1; i < count; i++) if (cascadeDue(i, count, frame)) due++
        expect(due).toBeLessThanOrEqual(1)
        renders += due
      }
      // Every coarse cascade still refreshes within 8 frames.
      for (let i = 1; i < count; i++) {
        let hits = 0
        for (let frame = 0; frame < 8; frame++) if (cascadeDue(i, count, frame)) hits++
        expect(hits).toBeGreaterThanOrEqual(1)
      }
      expect(renders).toBeLessThanOrEqual(8)
    }
  })
})

describe('cascadeRefresh', () => {
  const renders = (count: number, moving: boolean, night: boolean, frames = 16) => {
    let total = 0
    for (let frame = 0; frame < frames; frame++) {
      for (let index = 0; index < count; index++) if (cascadeRefresh({ index, count, frame, moving, night })) total++
    }
    return total
  }

  it('re-renders far less while the camera is still', () => {
    expect(renders(3, true, false)).toBe(28)
    expect(renders(3, false, false)).toBe(6)
    expect(renders(3, false, true)).toBe(3)
  })

  it('halves the first cascade too in a wide aerial view, one cascade per frame', () => {
    for (let frame = 0; frame < 16; frame++) {
      let due = 0
      for (let index = 0; index < 3; index++) if (cascadeRefresh({ index, count: 3, frame, moving: true, night: false, wide: true })) due++
      expect(due).toBeLessThanOrEqual(1)
    }
    expect(cascadeRefresh({ index: 0, count: 3, frame: 0, moving: true, night: false, wide: true })).toBe(true)
    expect(cascadeRefresh({ index: 1, count: 3, frame: 1, moving: true, night: false, wide: true })).toBe(true)
    expect(cascadeRefresh({ index: 2, count: 3, frame: 3, moving: true, night: false, wide: true })).toBe(true)
  })

  it('lets the moon’s last cascade lag while moving', () => {
    expect(renders(3, true, true)).toBeLessThan(renders(3, true, false))
    for (let frame = 0; frame < 16; frame++) expect(cascadeRefresh({ index: 0, count: 3, frame, moving: true, night: true })).toBe(true)
  })
})

describe('holdOrSnap', () => {
  it('holds small changes and snaps large ones to the grid', () => {
    expect(holdOrSnap(null, 83, 0.12, 5)).toBe(85)
    expect(holdOrSnap(85, 90, 0.12, 5)).toBe(85)
    expect(holdOrSnap(85, 120, 0.12, 5)).toBe(120)
  })
})

describe('cascadeTuning', () => {
  it('scales the normal bias with texel size and keeps the first cascade sharper', () => {
    const nearCascade = cascadeTuning(0, 10, 2048, 120)
    const farCascade = cascadeTuning(2, 120, 2048, 300)
    expect(farCascade.normalBias).toBeGreaterThan(nearCascade.normalBias * 5)
    expect(nearCascade.radius).toBeLessThan(farCascade.radius)
    expect(nearCascade.bias).toBeLessThan(0)
    // A near-cascade normal bias above ~2 cm visibly lifts chair-leg shadows off the floor.
    expect(nearCascade.normalBias).toBeLessThan(0.02)
  })

  it('matches the tier table', () => {
    expect(sunShadowTier('low')).toEqual({ cascades: 2, mapSize: 1024 })
    expect(sunShadowTier('medium').cascades).toBe(3)
    expect(sunShadowTier('ultra')).toEqual({ cascades: 4, mapSize: 4096 })
  })
})

function box(project: Project): Project {
  const level = createLevel('Ground', 0)
  const pts = [
    { x: -3, y: -2 },
    { x: 3, y: -2 },
    { x: 3, y: 2 },
    { x: -3, y: 2 },
  ]
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    if (a && b) level.walls.push(createWall(a, b))
  }
  project.levels = [level]
  return project
}

describe('shadowFocus', () => {
  const project = box(createProject('Test', 'house'))
  const view = { activeLevelId: project.levels[0]?.id ?? '', levelDisplay: 'all' }

  it('focuses on the room when the camera is inside it', () => {
    const focus = shadowFocus(project, view, { x: 0, y: 1.6, z: 0 }, 0.2)
    expect(focus.indoor).toBe(true)
    expect(focus.focus).not.toBeNull()
    expect(focus.focus ?? 0).toBeGreaterThan(6)
    expect(focus.focus ?? 99).toBeLessThan(10)
    expect(focus.start).toBe(0.2)
  })

  it('covers the plot plus margin from outside and starts at the nearest content', () => {
    const half = Math.max(project.terrain.width, project.terrain.depth) / 2
    const focus = shadowFocus(project, view, { x: 0, y: 40, z: 0 }, 0.2)
    expect(focus.indoor).toBe(false)
    expect(focus.focus).toBeNull()
    expect(focus.start).toBeGreaterThan(20)
    expect(focus.far).toBeGreaterThan(half + PLOT_MARGIN - 1)
    expect(focus.far).toBeLessThanOrEqual(320)
  })
})

describe('assignLampSlots', () => {
  const lamp = (key: string, distance: number, inView = true, range = 6): LampCandidate => ({ key, distance, range, inView })

  it('picks the nearest on-screen lamps and leaves spare slots idle', () => {
    const out = assignLampSlots([lamp('a', 9), lamp('b', 2), lamp('c', 4), lamp('d', 1, false)], 2)
    expect(out).toEqual(['b', 'c'])
    expect(assignLampSlots([lamp('a', 3)], 3)).toEqual(['a', null, null])
  })

  it('keeps a held lamp in its slot and resists small swaps', () => {
    const prev = ['c', 'b']
    const out = assignLampSlots([lamp('b', 2), lamp('c', 4), lamp('e', 3.6)], 2, prev)
    expect(out).toEqual(['c', 'b'])
    const moved = assignLampSlots([lamp('b', 2), lamp('c', 12), lamp('e', 1)], 2, prev)
    expect(moved[1]).toBe('b')
    expect(moved[0]).toBe('e')
  })

  it('ignores lamps far beyond their reach', () => {
    expect(assignLampSlots([lamp('far', 200, true, 4)], 2)).toEqual([null, null])
  })
})
