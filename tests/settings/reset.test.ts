import { describe, expect, it } from 'vitest'
import { resetSettings, useSettings } from '../../src/settings'

describe('resetSettings', () => {
  it('restores preferences and keeps brief progress', () => {
    useSettings.getState().setSettings({ showFps: true, uiScale: 1.2, briefStars: { cottage: 2 } })
    resetSettings()
    const state = useSettings.getState()
    expect(state.showFps).toBe(false)
    expect(state.uiScale).toBe(1)
    expect(state.briefStars).toEqual({ cottage: 2 })
    expect(state.theme).toBe('cozy')
    expect(state.qualityAuto).toBe(false)
  })
})
