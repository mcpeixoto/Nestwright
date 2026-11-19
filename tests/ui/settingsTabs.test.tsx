/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { SettingsDialog } from '../../src/ui/SettingsDialog'
import { setSettingsOpen, setSettingsTab } from '../../src/ui/settingsDialogState'

const TAB_NAMES = ['General', 'Graphics', 'Controls', 'Sound', 'Advanced']

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  host.remove()
  setSettingsOpen(false)
  setSettingsTab('general')
})

function tabs(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[role="tab"]')]
}

function clickTab(name: string): void {
  const tab = tabs().find((el) => el.textContent === name)
  if (!tab) throw new Error(`missing tab ${name}`)
  act(() => {
    tab.click()
  })
}

describe('settings tabs', () => {
  it('opens on five tabs and keeps a reset button on each', () => {
    setSettingsOpen(true)
    act(() => {
      root.render(<SettingsDialog />)
    })

    expect(tabs().map((el) => el.textContent)).toEqual(TAB_NAMES)
    const language = [...document.querySelectorAll('label')].find((el) => el.textContent?.includes('Language'))
    expect(language?.querySelector('select')).toBeTruthy()
    expect(document.body.textContent).not.toContain('Pick graphics automatically')

    clickTab('Graphics')
    expect(document.body.textContent).toContain('Pick graphics automatically')
    expect(document.body.textContent).not.toContain('Language')

    clickTab('Controls')
    expect(document.querySelector('.readout')?.textContent).toBe('1.0×')

    for (const name of TAB_NAMES) {
      clickTab(name)
      const reset = [...document.querySelectorAll('button')].find((el) => el.textContent === 'Reset to defaults')
      expect(reset, name).toBeTruthy()
    }
  })
})
