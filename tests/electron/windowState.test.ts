import { describe, expect, it } from 'vitest'
import { fitWindow, parseWindowState } from '../../electron/windowState'

const LAPTOP = { x: 0, y: 0, width: 1440, height: 900 }

describe('window state', () => {
  it('rejects values that are not a saved window', () => {
    expect(parseWindowState(null)).toBeNull()
    expect(parseWindowState({ width: 'wide', height: 800 })).toBeNull()
    expect(parseWindowState({ width: 100, height: 100 })).toBeNull()
    expect(parseWindowState({ width: Number.NaN, height: 900 })).toBeNull()
  })

  it('keeps a sensible window and remembers maximised', () => {
    expect(parseWindowState({ x: 40, y: 20, width: 1600, height: 1000, maximized: true })).toEqual({
      x: 40,
      y: 20,
      width: 1600,
      height: 1000,
      maximized: true,
    })
  })

  it('pulls an off-screen window back onto the work area', () => {
    const parsed = parseWindowState({ x: -3000, y: 4000, width: 5000, height: 4000, maximized: false })
    expect(parsed).not.toBeNull()
    if (!parsed) return
    expect(fitWindow(parsed, LAPTOP)).toEqual({
      x: 0,
      y: 0,
      width: 1440,
      height: 900,
      maximized: false,
    })
  })

  it('nudges a window that only partly leaves the screen', () => {
    const parsed = parseWindowState({ x: 1400, y: -40, width: 1280, height: 720, maximized: false })
    expect(parsed).not.toBeNull()
    if (!parsed) return
    const fitted = fitWindow(parsed, LAPTOP)
    expect(fitted.x + fitted.width).toBeLessThanOrEqual(LAPTOP.width)
    expect(fitted.x).toBeGreaterThanOrEqual(0)
    expect(fitted.y).toBeGreaterThanOrEqual(0)
    expect(fitted.width).toBe(1280)
    expect(fitted.height).toBe(720)
  })
})
