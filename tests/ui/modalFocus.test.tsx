/**
 * @vitest-environment jsdom
 */
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
import { Modal } from '../../src/ui/Modal'

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
})

function Probe({ empty = false }: { empty?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button type="button" id="open" onClick={() => setOpen(true)}>
        Open
      </button>
      {open ? (
        <Modal label="Test dialog" onClose={() => setOpen(false)}>
          {empty ? (
            <p>Nothing to focus</p>
          ) : (
            <>
              <button type="button">One</button>
              <button type="button">Two</button>
            </>
          )}
        </Modal>
      ) : null}
    </div>
  )
}

function tab(shift = false): void {
  document.activeElement?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true, shiftKey: shift }),
  )
}

describe('modal focus', () => {
  it('moves focus into the dialog and cycles Tab inside it', async () => {
    await act(async () => {
      root.render(<Probe />)
    })
    const open = document.getElementById('open') as HTMLButtonElement
    open.focus()
    await act(async () => {
      open.click()
    })
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement?.textContent).toBe('One')

    await act(async () => {
      tab()
    })
    expect(document.activeElement?.textContent).toBe('Two')

    await act(async () => {
      tab()
    })
    expect(document.activeElement?.textContent).toBe('One')

    await act(async () => {
      tab(true)
    })
    expect(document.activeElement?.textContent).toBe('Two')
  })

  it('restores focus to the opener when Escape closes the dialog', async () => {
    await act(async () => {
      root.render(<Probe />)
    })
    const open = document.getElementById('open') as HTMLButtonElement
    open.focus()
    await act(async () => {
      open.click()
    })
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(open)
  })

  it('focuses the dialog when it has no focusable controls', async () => {
    await act(async () => {
      root.render(<Probe empty />)
    })
    const open = document.getElementById('open') as HTMLButtonElement
    await act(async () => {
      open.click()
    })
    expect(document.activeElement?.getAttribute('role')).toBe('dialog')
  })
})
