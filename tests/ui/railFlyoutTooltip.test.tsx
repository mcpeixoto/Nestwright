/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
import { useSettings } from '../../src/settings'
import '../../src/tools'
import { ToolRail } from '../../src/ui/ToolRail'

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  useSettings.getState().setSettings({ railLabels: false })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  host.remove()
})

function groupButtons(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('[role="toolbar"] [aria-expanded]')]
}

function openGroup(button: HTMLButtonElement): void {
  button.click()
}

async function renderRail(): Promise<void> {
  await act(async () => {
    root.render(<ToolRail />)
  })
}

async function press(button: HTMLButtonElement, key: 'ArrowDown' | 'ArrowUp'): Promise<void> {
  await act(async () => {
    button.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}

describe('rail flyout tooltip', () => {
  it('hides a visible group tooltip as soon as that group flyout opens', async () => {
    await renderRail()
    vi.useFakeTimers()
    try {
      const build = groupButtons()[0]
      expect(build?.getAttribute('aria-label')).toBe('Build')
      await act(async () => {
        build?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400)
      })
      expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('Build')

      await act(async () => {
        build?.click()
      })
      expect(document.querySelector('[role="menu"]')).not.toBeNull()
      expect(document.querySelector('[role="tooltip"]')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not show the group tooltip while its flyout is open', async () => {
    await renderRail()
    vi.useFakeTimers()
    try {
      const build = groupButtons()[0]
      await act(async () => {
        openGroup(build!)
        build?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
      })
      expect(build?.getAttribute('aria-expanded')).toBe('true')
      expect(document.querySelector('[role="tooltip"]')).toBeNull()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400)
      })
      expect(document.querySelector('[role="tooltip"]')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('closes another group flyout when arrow keys move focus, even if the pointer stays', async () => {
    await renderRail()
    const [build, openings] = groupButtons()
    expect(build?.getAttribute('aria-label')).toBe('Build')
    expect(openings?.getAttribute('aria-label')).toBe('Doors & windows')

    await act(async () => {
      openGroup(build!)
    })
    expect(document.querySelector('[role="menu"]')).not.toBeNull()
    build?.focus()
    expect(document.querySelector('[role="menu"]')).not.toBeNull()

    await press(build!, 'ArrowDown')
    expect(document.activeElement).toBe(openings)
    expect(document.querySelector('[role="menu"]')).toBeNull()

    await act(async () => {
      openGroup(openings!)
    })
    expect(openings?.getAttribute('aria-expanded')).toBe('true')
    openings?.focus()
    await press(openings!, 'ArrowUp')
    expect(document.activeElement).toBe(build)
    expect(document.querySelector('[role="menu"]')).toBeNull()
  })

  it('closes a clicked flyout when focus moves to another rail button, and a click opens it again', async () => {
    await renderRail()
    const [build, openings] = groupButtons()
    const select = document.querySelector<HTMLButtonElement>('[role="toolbar"] [aria-label="Select"]')
    expect(select).not.toBeNull()

    await act(async () => {
      openGroup(build!)
    })
    expect(document.querySelector('[role="menu"]')).not.toBeNull()

    await act(async () => {
      select?.focus()
    })
    expect(document.activeElement).toBe(select)
    expect(document.querySelector('[role="menu"]')).toBeNull()

    await act(async () => {
      openings?.focus()
    })
    expect(document.querySelector('[role="menu"]')).toBeNull()

    await act(async () => {
      openGroup(build!)
    })
    expect(build?.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelector('[role="menu"]')).not.toBeNull()
  })
})
