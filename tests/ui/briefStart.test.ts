import { describe, expect, it } from 'vitest'
import { briefById } from '../../src/model/briefs'
import { sampleHeight } from '../../src/model/terrain'
import { useSettings } from '../../src/settings'
import { useStore } from '../../src/store'
import { startBrief } from '../../src/ui/briefs/startBrief'

describe('startBrief', () => {
  it('builds a fresh project named for the brief, with its id and plot', () => {
    const starter = briefById('starter-flat-for-two')
    const family = briefById('family-on-a-slope')
    if (!starter || !family || family.plot.slope == null) throw new Error('catalog briefs missing')

    useSettings.getState().setSettings({ language: 'en' })
    const before = useStore.getState().project.id
    expect(startBrief('family-on-a-slope')).toBe(false)
    expect(useStore.getState().project.id).toBe(before)
    expect(startBrief('missing-brief')).toBe(false)

    expect(startBrief(starter.id)).toBe(true)
    let project = useStore.getState().project
    expect(project.name).toBe(starter.title.en)
    expect(project.brief).toEqual({ id: starter.id })
    expect(project.terrain.width).toBe(starter.plot.width)
    expect(project.terrain.depth).toBe(starter.plot.depth)
    expect(project.levels).toHaveLength(1)
    expect(project.levels[0]?.walls).toEqual([])
    expect(project.terrain.heights.every((height) => height === 0)).toBe(true)

    useSettings.getState().setSettings({ language: 'pt-PT', briefStars: { [starter.id]: 1 } })
    expect(startBrief(family.id)).toBe(true)
    project = useStore.getState().project
    expect(project.name).toBe(family.title.pt)
    expect(project.brief).toEqual({ id: family.id })
    expect(project.terrain.width).toBe(family.plot.width)
    expect(project.terrain.depth).toBe(family.plot.depth)
    const { slope, depth } = family.plot
    // Level with the ground floor at the origin; falls to the front, rises to the back.
    expect(sampleHeight(project.terrain, 0, 0)).toBeCloseTo(0)
    expect(sampleHeight(project.terrain, 0, -depth / 2)).toBeCloseTo((-slope * depth) / 2)
    expect(sampleHeight(project.terrain, 0, depth / 2)).toBeCloseTo((slope * depth) / 2)
    expect(sampleHeight(project.terrain, family.plot.width / 2, 0)).toBeCloseTo(sampleHeight(project.terrain, 0, 0))
  })
})
