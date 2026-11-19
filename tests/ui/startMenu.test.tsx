/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
import { helpPage, setHelpPage } from '../../src/achievements/helpPage'
import { useStore } from '../../src/store'
import { isHelpOpen, setHelpOpen } from '../../src/ui/shortcuts'
import { MainMenu } from '../../src/ui/start/MainMenu'
import { canContinueProject, currentScreen, showStart } from '../../src/ui/session'

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  showStart()
  setHelpOpen(false)
  setHelpPage('shortcuts')
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

function buttonNamed(name: string): HTMLButtonElement | null {
  return (
    [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((button) => {
      const accessible = button.getAttribute('aria-label') ?? button.textContent?.replace(/\s+/g, ' ').trim()
      return accessible === name
    }) ?? null
  )
}

async function renderMenu(): Promise<void> {
  await act(async () => {
    root.render(<MainMenu />)
  })
}

describe('start main menu', () => {
  it('renders the main actions and disables Continue when nothing can be resumed', async () => {
    await renderMenu()
    for (const name of ['Continue', 'New house', 'Open…', 'Settings', 'Credits']) {
      expect(buttonNamed(name), name).not.toBeNull()
    }
    expect(buttonNamed('Quit')).toBeNull()
    expect(canContinueProject()).toBe(false)
    expect(buttonNamed('Continue')?.disabled).toBe(true)
  })

  it('opens the new-house choices and returns', async () => {
    await renderMenu()
    await act(async () => {
      buttonNamed('New house')?.click()
    })
    for (const name of ['Blank', 'From template', 'From brief', 'Back']) {
      expect(buttonNamed(name), name).not.toBeNull()
    }
    await act(async () => {
      buttonNamed('Back')?.click()
    })
    expect(buttonNamed('New house')).not.toBeNull()
    expect(buttonNamed('Blank')).toBeNull()
  })

  it('starts a blank house without a confirm dialog', async () => {
    await renderMenu()
    await act(async () => {
      buttonNamed('New house')?.click()
    })
    await act(async () => {
      buttonNamed('Blank')?.click()
    })
    expect(currentScreen()).toBe('editor')
    const project = useStore.getState().project
    expect(project.name).toBe('Untitled')
    expect(project.levels[0]?.walls.length).toBe(0)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('opens Help on the Credits tab', async () => {
    await renderMenu()
    await act(async () => {
      buttonNamed('Credits')?.click()
    })
    expect(isHelpOpen()).toBe(true)
    expect(helpPage()).toBe('credits')
  })
})
