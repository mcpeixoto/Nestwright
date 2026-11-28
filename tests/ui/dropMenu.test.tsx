/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
import { DropMenu } from '../../src/ui/topbar/DropMenu'

let host: HTMLDivElement
let root: Root
const run = vi.fn()

beforeEach(async () => {
  run.mockClear()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root.render(
      <DropMenu
        label="Share"
        items={[
          { id: 'a', label: 'Alpha', run },
          { id: 'b', label: 'Beta', run },
        ]}
      />,
    )
  })
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const trigger = () => host.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!
const menu = () => document.querySelector('[role="menu"]')
const items = () => [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]

async function openMenu(): Promise<void> {
  await act(async () => trigger().click())
}

describe('DropMenu', () => {
  it('opens on click and focuses the first item', async () => {
    expect(menu()).toBeNull()
    await openMenu()
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(items()[0])
  })

  it('closes on an outside pointerdown', async () => {
    await openMenu()
    await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })))
    expect(menu()).toBeNull()
  })

  it('closes on Escape', async () => {
    await openMenu()
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(menu()).toBeNull()
  })

  it('moves focus with ArrowDown', async () => {
    await openMenu()
    await act(async () => items()[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
    expect(document.activeElement).toBe(items()[1])
  })

  it('runs an item and closes', async () => {
    await openMenu()
    await act(async () => items()[1]!.click())
    expect(run).toHaveBeenCalledTimes(1)
    expect(menu()).toBeNull()
  })
})
