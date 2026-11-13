import { describe, expect, it } from 'vitest'
import { earnedNow, type FeatureSet } from '../../src/achievements/evaluate'
import { liveFeatures } from '../../src/achievements/features'
import { achievementProgress, installAchievementWatch, resetAchievementWatchForTests } from '../../src/achievements/watch'
import { emptyProgress, loadProgress, mergeProgress, progressForCause, saveProgress, type AchievementProgress } from '../../src/achievements/progress'
import { createProject } from '../../src/model/defaults'
import { familyHouse } from '../../src/templates/family'
import { useStore } from '../../src/store'
import type { Project } from '../../src/model/types'

const FEATURES: FeatureSet = {
  walls: true,
  rooms: true,
  storeys: true,
  roofs: true,
  plants: true,
  pools: true,
  walk: true,
  night: true,
  cat: true,
  coop: false,
  garden: true,
  items: true,
  paint: true,
  photo: true,
  budget: false,
}

function memory(): Pick<Storage, 'getItem' | 'setItem'> {
  const bin = new Map<string, string>()
  return {
    getItem: (key) => bin.get(key) ?? null,
    setItem: (key, value) => {
      bin.set(key, value)
    },
  }
}

describe('achievement progress', () => {
  it('keeps an unlock after it is saved and loaded', () => {
    const store = memory()
    const project = createProject('Keep', 'house')
    const first = mergeProgress(loadProgress(store), {
      project,
      view: '2d',
      features: FEATURES,
      paintedSurfaces: [],
      photoExported: true,
      catMode: false,
      coopSession: false,
      walkedAtNight: false,
    })
    expect(first.fresh).toEqual(['photographer'])
    saveProgress(store, first.next)
    const loaded = loadProgress(store)
    expect(loaded.unlocked).toEqual(['photographer'])
    expect(loaded.photoExported).toBe(true)
    const again = mergeProgress(loaded, {
      project,
      view: '2d',
      features: FEATURES,
      paintedSurfaces: [],
      photoExported: true,
      catMode: false,
      coopSession: false,
      walkedAtNight: false,
    })
    expect(again.fresh).toEqual([])
    expect(earnedNow({
      project,
      view: '2d',
      features: FEATURES,
      paintedSurfaces: [],
      photoExported: again.next.photoExported,
      catMode: false,
      coopSession: false,
      walkedAtNight: false,
    })).toContain('photographer')
  })

  it('ignores a corrupt save and a missing storage', () => {
    const store = memory()
    store.setItem('nestwright:achievements', '{not json')
    expect(loadProgress(store)).toEqual<AchievementProgress>({
      unlocked: [],
      painted: [],
      photoExported: false,
      catMode: false,
      coopSession: false,
      walkedAtNight: false,
    })
    expect(loadProgress(null).unlocked).toEqual([])
    expect(() => saveProgress(null, loadProgress(null))).not.toThrow()
  })

  it('does not unlock together when co-op is not a feature of this build', () => {
    const project = createProject('Solo', 'house') as Project
    const merged = mergeProgress(loadProgress(null), {
      project,
      view: '2d',
      features: FEATURES,
      paintedSurfaces: [],
      photoExported: false,
      catMode: false,
      coopSession: true,
      walkedAtNight: false,
    })
    expect(merged.fresh).not.toContain('together')
    expect(merged.next.coopSession).toBe(true)
  })

  it('loading the family-house template unlocks nothing', () => {
    const project = familyHouse()
    const ctx = {
      project,
      view: '2d' as const,
      features: liveFeatures(project),
      paintedSurfaces: [] as string[],
      photoExported: false,
      catMode: false,
      coopSession: false,
      walkedAtNight: false,
    }
    const loaded = progressForCause(emptyProgress(), ctx, 'load')
    expect(loaded.fresh).toEqual([])
    expect(loaded.next.unlocked).toEqual([])
    const remote = progressForCause(emptyProgress(), ctx, 'remote')
    expect(remote.fresh).toEqual([])
  })

  it('does not unlock a loaded template on the next unrelated edit', () => {
    resetAchievementWatchForTests()
    installAchievementWatch()
    try {
      useStore.getState().setProject(familyHouse())
      useStore.getState().apply('Rename level', (project) => {
        const level = project.levels[0]
        if (level) level.name = 'Renamed storey'
      })
      expect(achievementProgress().unlocked).toEqual([])
      useStore.getState().apply('Set budget', (project) => {
        project.budget.target = 1_000_000_000
      })
      expect(achievementProgress().unlocked).toEqual(['budget-master'])
    } finally {
      resetAchievementWatchForTests()
    }
  })
})
