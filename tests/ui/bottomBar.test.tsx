/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
import { BottomBar } from '../../src/ui/BottomBar'
import { formatHour } from '../../src/ui/bottomBar/time'
import { createProject } from '../../src/model/defaults'
import { insertLevel } from '../../src/model/levels'
import { useStore } from '../../src/store'
import { setUnits } from '../../src/settings/units'
import { isPanelOpen, setPanelOpen } from '../../src/ui/panels/registry'

let host: HTMLDivElement
let root: Root

beforeEach(async () => {
  const project = createProject('Test', 'house')
  const second = insertLevel(project.levels, project.levels[0]!.id, 'above')!
  second.elevation = 3
  useStore.getState().setProject(project)
  setUnits('metric')
  setPanelOpen('environment', false)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root.render(<BottomBar />))
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const button = (name: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!
const items = () => [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
const click = (el: HTMLElement) => act(() => el.click())

describe('BottomBar', () => {
  it('formats elevations in the project units', () => {
    const elevs = () => [...host.querySelectorAll('.levelbar .elev')].map((el) => el.textContent)
    expect(elevs()).toEqual(['0 m', '3 m'])
    act(() => setUnits('imperial'))
    expect(elevs()).toEqual([`0' 0"`, `9' 10"`])
  })

  it('opens the add-level menu', () => {
    click(button('Add level'))
    expect(items().map((item) => item.textContent)).toEqual([
      'Add level above',
      'Add level below',
      'Duplicate',
      'Delete level',
      'Import trace image…',
    ])
  })

  it('toggles grid snapping from the Snap menu', () => {
    click(button('Snap'))
    const grid = items().find((item) => item.textContent === 'Grid')!
    expect(grid.classList.contains('on')).toBe(true)
    click(grid)
    expect(useStore.getState().snapGrid).toBe(false)
    useStore.getState().setSnap({ snapGrid: true })
  })

  it('toggles roofs', () => {
    const roof = [...host.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((b) => b.textContent === 'Roof')!
    expect(roof.getAttribute('aria-pressed')).toBe('true')
    click(roof)
    expect(useStore.getState().showRoofs).toBe(false)
    useStore.getState().setShowRoofs(true)
  })

  it('opens the Daylight panel from the clock chip', () => {
    const chip = button('Daylight')
    expect(chip.textContent).toMatch(/^☀ \d{2}:\d{2}$/)
    click(chip)
    expect(isPanelOpen('environment')).toBe(true)
  })

  it('shows the notice text', () => {
    act(() => useStore.getState().setMessage('Hello'))
    expect(host.querySelector('.statusbar .status-msg')!.textContent).toBe('Hello')
  })
})

describe('formatHour', () => {
  it('formats and wraps', () => {
    expect(formatHour(14.5)).toBe('14:30')
    expect(formatHour(23.999)).toBe('00:00')
  })
})
