/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { bindTourEscape, isTourOpen, replayTour } from '../../src/ui/onboarding/Tour'

afterEach(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
})

describe('tour escape', () => {
  it('closes the tour on Escape without reaching later handlers', () => {
    replayTour()
    expect(isTourOpen()).toBe(true)
    const later = viListener()
    window.addEventListener('keydown', later.fn)
    const unbind = bindTourEscape()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(isTourOpen()).toBe(false)
    expect(later.calls()).toBe(0)
    unbind()
    window.removeEventListener('keydown', later.fn)
  })

  it('leaves Escape alone once the tour is closed', () => {
    replayTour()
    const unbind = bindTourEscape()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(isTourOpen()).toBe(false)
    const later = viListener()
    window.addEventListener('keydown', later.fn)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(later.calls()).toBe(1)
    unbind()
    window.removeEventListener('keydown', later.fn)
  })
})

function viListener(): { fn: (event: KeyboardEvent) => void; calls: () => number } {
  let count = 0
  return {
    fn: () => {
      count += 1
    },
    calls: () => count,
  }
}
