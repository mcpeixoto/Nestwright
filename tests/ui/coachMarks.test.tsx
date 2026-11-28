/**
 * @vitest-environment jsdom
 */
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
import { armTour, disarmTour, isTourArmed, isTourOpen, replayTour, Tour } from '../../src/ui/onboarding/Tour'

let root: Root | null = null

function render(element: ReactElement): void {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(element))
}

function mount(): void {
  for (const id of ['build', 'view-3d']) {
    const button = document.createElement('button')
    button.dataset.tour = id
    document.body.append(button)
  }
  render(<Tour />)
}

function mark(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="dialog"].coach-mark')
}

function click(label: string): void {
  const button = [...document.querySelectorAll('.coach-mark button')].find((item) => item.textContent === label)
  if (!button) throw new Error('missing ' + label)
  act(() => (button as HTMLButtonElement).click())
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
})

describe('coach marks', () => {
  it('pins step 1 to its anchor with progress', () => {
    armTour()
    mount()
    expect(mark()?.textContent).toContain('Draw walls')
    expect(mark()?.textContent).toContain('Step 1 of 6')
    expect(mark()?.dataset.anchor).toBe('build')
  })

  it('moves with Next and Back and shows dots', () => {
    replayTour()
    mount()
    click('Next')
    expect(mark()?.textContent).toContain('See the room')
    expect(mark()?.textContent).toContain('Step 2 of 6')
    expect(mark()?.classList.contains('centered')).toBe(true)
    click('Back')
    expect(mark()?.textContent).toContain('Step 1 of 6')
    const dots = document.querySelectorAll('.coach-mark .dots i')
    expect(dots).toHaveLength(6)
    expect(dots[0]?.classList.contains('on')).toBe(true)
  })

  it('Skip closes and remembers', () => {
    replayTour()
    mount()
    click('Skip')
    expect(isTourOpen()).toBe(false)
    expect(localStorage.getItem('nestwright:tour')).toBe('done')
    expect(isTourArmed()).toBe(false)
  })

  it('replay always arms', () => {
    disarmTour()
    replayTour()
    expect(isTourOpen()).toBe(true)
    mount()
    click('Skip')
    expect(isTourArmed()).toBe(false)
  })

  it('renders nothing when never armed', async () => {
    vi.resetModules()
    localStorage.clear()
    const fresh = await import('../../src/ui/onboarding/Tour')
    expect(fresh.isTourArmed()).toBe(false)
    render(<fresh.Tour />)
    expect(mark()).toBeNull()
  })
})
