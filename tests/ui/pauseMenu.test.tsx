/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
import { useStore } from '../../src/store'
import '../../src/ui/builtinShortcuts'
import { PauseMenu } from '../../src/ui/PauseMenu'
import { isPauseOpen, setPauseOpen } from '../../src/ui/pauseMenuState'
import { listShortcuts } from '../../src/ui/shortcuts'

function clearSelection() {
  const shortcut = listShortcuts().find((entry) => entry.id === 'clear-selection')
  if (!shortcut) throw new Error('missing clear-selection shortcut')
  return shortcut
}

function escape(): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
}

const LABELS = ['Resume', 'Save', 'Save As…', 'Open…', 'New house', 'Settings', 'Help', 'Main menu']

let host: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount()
    })
  }
  host?.remove()
  host = null
  root = null
  document.body.replaceChildren()
  setPauseOpen(false)
  useStore.getState().select([])
  useStore.getState().setTool('select')
})

describe('pause menu', () => {
  it('clears a selection and stays closed', () => {
    useStore.getState().select(['w1'])
    clearSelection().run(escape())
    expect(useStore.getState().selection).toEqual([])
    expect(isPauseOpen()).toBe(false)
  })

  it('returns to Select when another tool is active', () => {
    useStore.getState().select([])
    useStore.getState().setTool('wall')
    clearSelection().run(escape())
    expect(useStore.getState().tool).toBe('select')
    expect(isPauseOpen()).toBe(false)
  })

  it('opens when nothing is selected and Select is active', () => {
    useStore.getState().select([])
    useStore.getState().setTool('select')
    clearSelection().run(escape())
    expect(isPauseOpen()).toBe(true)
  })

  it('stays closed while a menu flyout is open', () => {
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    document.body.append(menu)
    useStore.getState().select([])
    useStore.getState().setTool('select')
    clearSelection().run(escape())
    expect(isPauseOpen()).toBe(false)
  })

  it('renders Paused and closes on Resume or Escape', async () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root?.render(<PauseMenu />)
    })
    await act(async () => {
      setPauseOpen(true)
    })
    const dialog = document.querySelector('[role="dialog"][aria-label="Paused"]')
    expect(dialog).toBeTruthy()
    const labels = [...document.querySelectorAll('button')].map((button) => button.textContent?.trim())
    for (const name of LABELS) expect(labels).toContain(name)
    expect(labels).not.toContain('Quit')

    const resume = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Resume')
    await act(async () => {
      resume?.click()
    })
    expect(isPauseOpen()).toBe(false)
    expect(document.querySelector('[role="dialog"][aria-label="Paused"]')).toBeNull()

    await act(async () => {
      setPauseOpen(true)
    })
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })
    expect(isPauseOpen()).toBe(false)
  })
})
