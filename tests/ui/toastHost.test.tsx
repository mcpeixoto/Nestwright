/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastHost, dismissToast, showToast } from '../../src/ui/toast'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20_000)
    root.unmount()
  })
  host.remove()
  vi.useRealTimers()
})

async function renderHost(): Promise<void> {
  await act(async () => {
    root.render(<ToastHost />)
  })
}

describe('toast host', () => {
  it('renders toast text inside the status region', async () => {
    await renderHost()
    act(() => {
      showToast('Hi')
    })
    const status = document.querySelector('[role="status"]')
    expect(status?.querySelector('.toast')?.textContent).toBe('Hi')
  })

  it('runs an action once and removes the toast', async () => {
    await renderHost()
    const run = vi.fn()
    act(() => {
      showToast('Undo?', { action: { label: 'Undo', run } })
    })
    const button = [...document.body.querySelectorAll('button')].find((item) => item.textContent === 'Undo')
    expect(button).toBeTruthy()
    await act(async () => {
      button?.click()
    })
    expect(run).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.toast')).toBeNull()
  })

  it('removes a short toast after its duration', async () => {
    await renderHost()
    act(() => {
      showToast('Quick', { duration: 1000 })
    })
    expect(document.querySelector('.toast')?.textContent).toBe('Quick')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })
    expect(document.querySelector('.toast')).toBeNull()
  })

  it('removes a toast at once when dismissed', async () => {
    await renderHost()
    let id = 0
    act(() => {
      id = showToast('Stay')
    })
    expect(document.querySelector('.toast')).not.toBeNull()
    act(() => {
      dismissToast(id)
    })
    expect(document.querySelector('.toast')).toBeNull()
  })
})
