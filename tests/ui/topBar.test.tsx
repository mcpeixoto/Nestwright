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
import '../../src/ui/topbar/exportMenu'

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

function overflowMenu(): HTMLElement {
  const more = document.querySelector<HTMLButtonElement>('button[aria-label="More"]')
  const menu = more?.closest('.menu')
  if (!(menu instanceof HTMLElement)) throw new Error('missing overflow menu')
  return menu
}

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

describe('top bar clusters', () => {
  it('keeps design actions and save outside the overflow menu at a wide viewport', async () => {
    await renderBar()
    const menu = overflowMenu()
    for (const name of ['Wishes', 'Variants', 'Together', 'Photo', 'Export', 'Save']) {
      const button = buttonNamed(name)
      expect(button, name).not.toBeNull()
      expect(menu.contains(button), name).toBe(false)
    }
    for (const name of ['New', 'Open']) {
      const button = buttonNamed(name)
      expect(button, name).not.toBeNull()
      expect(menu.contains(button), name).toBe(true)
    }
  })

  it('names each design button accessibly', async () => {
    await renderBar()
    for (const name of ['Wishes', 'Variants', 'Together', 'Photo', 'Export']) {
      expect(buttonNamed(name), name).not.toBeNull()
    }
  })

  it('toggles the wishes panel on', async () => {
    await renderBar()
    const wishes = buttonNamed('Wishes')
    expect(wishes).not.toBeNull()
    expect(wishes?.classList.contains('on')).toBe(false)
    expect(isPanelOpen('wishes')).toBe(false)

    await act(async () => {
      wishes?.click()
    })
    expect(buttonNamed('Wishes')?.classList.contains('on')).toBe(true)
    expect(isPanelOpen('wishes')).toBe(true)
  })
})
