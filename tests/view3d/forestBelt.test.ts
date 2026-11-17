import { describe, expect, it } from 'vitest'
import { skyParams } from '../../src/view3d/atmosphere/skyParams'
import { canopyHeight, FOREST_BELT, forestBeltGeometry, woodland } from '../../src/view3d/terrain/forestBelt'

const samples = (n: number) => Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2)

describe('forest belt', () => {
  it('breaks the skyline with tree crowns, not a smooth band', () => {
    // Neighbouring samples ~2 m apart along the front edge differ by crown bumps.
    const angles = samples(FOREST_BELT.segs).filter((a) => woodland(a) > 0.99)
    expect(angles.length).toBeGreaterThan(200)
    let jitter = 0
    for (const a of angles) jitter += Math.abs(canopyHeight(a, 0.12) - canopyHeight(a + (Math.PI * 2) / FOREST_BELT.segs, 0.12))
    expect(jitter / angles.length).toBeGreaterThan(0.5)
    const heights = angles.map((a) => canopyHeight(a, 0.12))
    expect(Math.min(...heights)).toBeGreaterThan(9)
    expect(Math.max(...heights)).toBeLessThan(26)
  })

  it('leaves open fields between the woods', () => {
    const shares = samples(720).map(woodland)
    const wooded = shares.filter((w) => w > 0.5).length / shares.length
    expect(wooded).toBeGreaterThan(0.5)
    expect(wooded).toBeLessThan(0.85)
    const open = samples(720).filter((a) => woodland(a) < 0.01)
    expect(open.length).toBeGreaterThan(40)
    for (const a of open) expect(canopyHeight(a, 0.12)).toBeLessThan(2.5)
  })

  it('sits outside the meadow and below the far ridge, rooted in the ground', () => {
    const geo = forestBeltGeometry()
    const pos = geo.getAttribute('position')
    let minR = Infinity
    let maxR = 0
    let minY = Infinity
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i))
      minR = Math.min(minR, r)
      maxR = Math.max(maxR, r)
      minY = Math.min(minY, pos.getY(i))
    }
    expect(minR).toBeGreaterThan(420 - 0.01) // meadow disc reach
    expect(maxR).toBeLessThan(600) // far ridge starts at 600 m
    expect(minY).toBeLessThan(0)
    expect(geo.getAttribute('color').count).toBe(pos.count)
    expect(geo.getAttribute('normal')).toBeDefined()
  })
})

describe('clear-day haze', () => {
  const fogAt = (d: number, p: { fogNear: number; fogFar: number }) =>
    Math.min(1, Math.max(0, (d - p.fogNear) / (p.fogFar - p.fogNear)))

  it('keeps the woods on the horizon green on a clear day, and murky in rain', () => {
    // Linear fog mixes the bright horizon in before tone mapping: even 0.14 outweighed a dark forest 10:1.
    const clear = skyParams(1.05, 'clear', 0.15)
    expect(fogAt(FOREST_BELT.inner + 20, clear)).toBeLessThan(0.05)
    expect(fogAt(850, clear)).toBeLessThan(0.12)
    const rain = skyParams(1.05, 'rain', 0.5)
    expect(fogAt(FOREST_BELT.inner + 20, rain)).toBeGreaterThan(0.25)
  })
})
