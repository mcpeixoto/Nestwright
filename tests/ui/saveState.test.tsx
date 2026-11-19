/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
import { getSaveState, markSaved } from '../../src/io/dirty'
import { useStore } from '../../src/store'
import { formatClock, saveStateLabel } from '../../src/ui/saveState'
import { TopBar } from '../../src/ui/TopBar'
import { setPanelOpen } from '../../src/ui/panels/registry'
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

async function renderBar(): Promise<void> {
  await act(async () => {
    root.render(<TopBar />)
  })
}

describe('save state', () => {
  it('records the time a document is marked saved', () => {
    markSaved()
    expect(typeof getSaveState().savedAt).toBe('number')
  })

  it('names dirty, saved, and never-saved documents', () => {
    expect(saveStateLabel({ dirty: true, savedAt: null })).toBe('Unsaved changes')
    expect(saveStateLabel({ dirty: false, savedAt: 1 })).toBe('Saved ✓')
    expect(saveStateLabel({ dirty: false, savedAt: null })).toBe('')
  })

  it('formats a local clock as zero-padded 24-hour HH:MM', () => {
    expect(formatClock(new Date(2026, 0, 1, 14, 2).getTime())).toBe('14:02')
  })

  it('shows unsaved and saved words in the top bar', async () => {
    await renderBar()
    await act(async () => {
      useStore.getState().apply('Rename', (draft) => {
        draft.name = 'Renamed house'
      })
    })
    expect(document.querySelector('.save-state')?.textContent).toContain('Unsaved changes')
    await act(async () => {
      markSaved()
    })
    expect(document.querySelector('.save-state')?.textContent).toContain('Saved ✓')
  })
})
