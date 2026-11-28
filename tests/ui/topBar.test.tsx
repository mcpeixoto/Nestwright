/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
import { isPanelOpen, setPanelOpen } from '../../src/ui/panels/registry'
import { TopBar } from '../../src/ui/TopBar'
import '../../src/ui/PhotoMode'
import '../../src/ui/panels/VariantsPanel'
import '../../src/ui/panels/WishesPanel'
import '../../src/ui/together/TogetherDialog'
import '../../src/ui/panels/EnvironmentPanel'

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false
      },
    }),
  })
  setPanelOpen('wishes', false)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  host.remove()
  setPanelOpen('wishes', false)
})

function buttonNamed(name: string): HTMLButtonElement | null {
  return (
    [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((button) => {
      const accessible = button.getAttribute('aria-label') ?? button.textContent?.replace(/\s+/g, ' ').trim()
      return accessible === name
    }) ?? null
  )
}

async function renderBar(): Promise<void> {
  await act(async () => {
    root.render(<TopBar />)
  })
}

function menuItems(): string[] {
  return [...document.querySelectorAll('[role="menu"] button')].map((item) => {
    expect(item.getAttribute('role')).toBe('menuitem')
    return item.textContent?.trim() ?? ''
  })
}

async function click(name: string): Promise<void> {
  await act(async () => {
    const button = buttonNamed(name)
    button?.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    button?.click()
  })
}

describe('top bar', () => {
  it('shows seven top-level controls', async () => {
    await renderBar()
    const group = document.querySelector('[role="group"][aria-label="View"]')
    for (const name of ['Plan', '3D', 'Walk']) {
      expect(group?.contains(buttonNamed(name)), name).toBe(true)
    }
    expect(buttonNamed('Plan + 3D')?.hasAttribute('aria-pressed')).toBe(true)
    for (const name of ['Undo', 'Redo']) expect(buttonNamed(name), name).not.toBeNull()
    for (const name of ['Plan menu', 'Share', 'Menu']) {
      expect(buttonNamed(name)?.getAttribute('aria-haspopup'), name).toBe('menu')
    }
    for (const name of ['More', 'Home', 'Brush', 'Export']) expect(buttonNamed(name), name).toBeNull()
  })

  it('menus hold the old actions', async () => {
    await renderBar()
    await click('Plan menu')
    expect(menuItems()).toEqual(expect.arrayContaining(['Wish list', 'Options A/B', 'Daylight']))
    expect(menuItems()).not.toContain('House brief')
    await click('Share')
    expect(menuItems()).toEqual(['Play together', 'Photo', 'Image', 'Floor plan PDF', 'Plan PNG', 'GLB'])
    await click('Menu')
    expect(menuItems()).toEqual(['New', 'Open', 'Save', 'Save As…', 'Backup file (JSON)', 'Settings', 'Help'])
  })

  it('toggles the wishes panel from the Plan menu', async () => {
    await renderBar()
    expect(isPanelOpen('wishes')).toBe(false)
    await click('Plan menu')
    await click('Wish list')
    expect(isPanelOpen('wishes')).toBe(true)
    expect(document.querySelector('[role="menu"]')).toBeNull()
    await click('Plan menu')
    expect(buttonNamed('Wish list')?.classList.contains('on')).toBe(true)
  })

  it('has no native tooltips', async () => {
    await renderBar()
    expect(document.querySelectorAll('[title]').length).toBe(0)
  })
})
