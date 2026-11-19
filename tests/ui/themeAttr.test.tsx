/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { useSettings } from '../../src/settings'
import installTheme from '../../src/ui/theme'

afterEach(() => {
  useSettings.getState().setSettings({ theme: 'cozy' })
})

describe('installTheme', () => {
  it('sets data-theme from the store and stops when unsubscribed', () => {
    const stop = installTheme()
    expect(document.documentElement.dataset.theme).toBe('cozy')
    useSettings.getState().setSettings({ theme: 'night' })
    expect(document.documentElement.dataset.theme).toBe('night')
    stop()
    useSettings.getState().setSettings({ theme: 'cozy' })
    expect(document.documentElement.dataset.theme).toBe('night')
  })
})
