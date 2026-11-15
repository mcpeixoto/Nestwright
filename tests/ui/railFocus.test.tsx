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

function railButtons(): HTMLButtonElement[] {
  const rail = document.querySelector('[role="toolbar"]')
  if (!rail) return []
  return [...rail.querySelectorAll<HTMLButtonElement>('button')].filter((button) => !button.closest('[role="menu"]'))
}

function groupButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>('[role="toolbar"] [aria-expanded]')
  if (!button) throw new Error('missing group button')
  return button
}

async function renderRail(): Promise<void> {
  await act(async () => {
    root.render(<ToolRail />)
  })
}

describe('tool rail focus', () => {
  it('toggles a group flyout on click and marks it expanded', async () => {
    await renderRail()
    const button = groupButton()
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('[role="menu"]')).toBeNull()

    await act(async () => {
      button.click()
    })
    expect(document.querySelector('[role="menu"]')).not.toBeNull()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelector('[role="menuitem"]')).not.toBeNull()

    await act(async () => {
      button.click()
    })
    expect(document.querySelector('[role="menu"]')).toBeNull()
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('closes the flyout on Escape and when a tool is picked', async () => {
    await renderRail()
    const button = groupButton()
    await act(async () => {
      button.click()
    })
    const item = document.querySelector<HTMLButtonElement>('[role="menuitem"]')
    expect(item).not.toBeNull()

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.querySelector('[role="menu"]')).toBeNull()

    await act(async () => {
      button.click()
    })
    const again = document.querySelector<HTMLButtonElement>('[role="menuitem"]')
    await act(async () => {
      again?.click()
    })
    expect(document.querySelector('[role="menu"]')).toBeNull()
  })

  it('closes the flyout on an outside pointerdown', async () => {
    await renderRail()
    const button = groupButton()
    await act(async () => {
      button.click()
    })
    expect(document.querySelector('[role="menu"]')).not.toBeNull()
    await act(async () => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    })
    expect(document.querySelector('[role="menu"]')).toBeNull()
  })

  it('moves focus between rail buttons with the arrow keys', async () => {
    await renderRail()
    const buttons = railButtons()
    expect(buttons.length).toBeGreaterThan(1)
    buttons[0]?.focus()
    await act(async () => {
      buttons[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    })
    expect(document.activeElement).toBe(buttons[1])

    await act(async () => {
      buttons[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }))
    })
    expect(document.activeElement).toBe(buttons[0])
  })

  it('opens the flyout with ArrowRight and returns with ArrowLeft and Escape', async () => {
    await renderRail()
    const button = groupButton()
    button.focus()
    await act(async () => {
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    })
    expect(document.activeElement?.getAttribute('role')).toBe('menuitem')

    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }))
    })
    expect(document.activeElement).toBe(button)
    expect(document.querySelector('[role="menu"]')).toBeNull()

    button.focus()
    await act(async () => {
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    })
    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })
    expect(document.activeElement).toBe(button)
    expect(document.querySelector('[role="menu"]')).toBeNull()
  })

  it('shows the tool label and shortcut in a tooltip', async () => {
    await renderRail()
    vi.useFakeTimers()
    try {
      const select = railButtons()[0]
      expect(select?.getAttribute('aria-label')).toBe('Select')
      await act(async () => {
        select?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
      })
      expect(document.querySelector('[role="tooltip"]')).toBeNull()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400)
      })
      const tip = document.querySelector('[role="tooltip"]')
      expect(tip?.textContent).toBe('Select (V)')
      expect(select?.getAttribute('aria-describedby')).toBe(tip?.id)
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders a short label under each rail icon when the setting is on', async () => {
    useSettings.getState().setSettings({ railLabels: true })
    await renderRail()
    const labels = [...document.querySelectorAll('.rail-label')].map((node) => node.textContent)
    expect(labels).toContain('Select')
    expect(labels).toContain('Build')
  })
})
