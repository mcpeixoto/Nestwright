import { beforeEach, describe, expect, it, vi } from 'vitest'

const noteSnapPoint = vi.fn()
vi.mock('../../src/audio/cue', () => ({ noteSnapPoint: (...args: unknown[]) => noteSnapPoint(...args) }))

const { snapPlanPoint } = await import('../../src/plan2d/snap')
const { createProject, createWall } = await import('../../src/model/defaults')

function level() {
  const project = createProject('Snap', 'house')
  const ground = project.levels[0]
  if (!ground) throw new Error('missing level')
  ground.walls.push(createWall({ x: 0, y: 0 }, { x: 4, y: 0 }))
  return ground
}

const settings = { grid: true, ends: true, angles: true }

describe('snap tick', () => {
  beforeEach(() => noteSnapPoint.mockClear())

  it('stays quiet while the pointer only rounds to the grid', () => {
    const ground = level()
    for (let i = 0; i < 20; i++) {
      snapPlanPoint({ x: 1.013 + i * 0.07, y: 2.031 }, ground, { prev: null, extra: [], shift: false, zoom: 1, settings })
    }
    expect(noteSnapPoint).not.toHaveBeenCalled()
  })

  it('ticks when the pointer catches a wall end', () => {
    const ground = level()
    const point = snapPlanPoint({ x: 4.03, y: 0.02 }, ground, { prev: null, extra: [], shift: false, zoom: 1, settings })
    expect(point).toEqual({ x: 4, y: 0 })
    expect(noteSnapPoint).toHaveBeenCalledTimes(1)
  })
})
