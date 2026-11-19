import { describe, expect, it } from 'vitest'
import { useSettings } from '../../src/settings'
import { setUnits } from '../../src/settings/units'
import { useStore } from '../../src/store'

describe('setUnits', () => {
  it('updates the preference and the project through one setter', () => {
    setUnits('imperial')
    expect(useSettings.getState().units).toBe('imperial')
    expect(useStore.getState().project.units).toBe('imperial')
    expect(useStore.getState().canUndo).toBe(true)
    setUnits('metric')
    expect(useSettings.getState().units).toBe('metric')
    expect(useStore.getState().project.units).toBe('metric')
  })
})
