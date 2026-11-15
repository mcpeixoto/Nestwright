import { describe, expect, it } from 'vitest'
import { dist } from '../../src/model/geometry'
import { calibrateTrace, fitTraceToView, pixelToPlan, planToPixel, traceBounds } from '../../src/model/trace'
import type { TraceImage } from '../../src/model/types'

function trace(partial: Partial<TraceImage> = {}): TraceImage {
  return {
    levelId: 'level_test',
    src: 'data:,',
    origin: { x: 2, y: 5 },
    scale: 0.02,
    rotation: 0,
    opacity: 0.5,
    ...partial,
  }
}

describe('trace image transforms', () => {
  it('maps image y downward onto decreasing plan y', () => {
    const image = trace({ origin: { x: 1, y: 2 }, scale: 0.5, rotation: 0 })
    const down = pixelToPlan(image, { x: 0, y: 4 })
    expect(down.x).toBeCloseTo(1)
    expect(down.y).toBeCloseTo(0)
    const right = pixelToPlan(image, { x: 3, y: 0 })
    expect(right.x).toBeCloseTo(2.5)
    expect(right.y).toBeCloseTo(2)
  })

  it('round-trips pixel to plan to pixel with rotation', () => {
    const image = trace({ rotation: Math.PI / 5, origin: { x: -1.5, y: 3.25 }, scale: 0.013 })
    const pixel = { x: 180.5, y: 42.25 }
    const plan = pixelToPlan(image, pixel)
    const back = planToPixel(image, plan)
    expect(back.x).toBeCloseTo(pixel.x)
    expect(back.y).toBeCloseTo(pixel.y)
  })

  it('keeps the first clicked point fixed and sets the real distance', () => {
    const image = trace({ rotation: 0.4, scale: 0.01, origin: { x: 1, y: 8 } })
    const p1 = pixelToPlan(image, { x: 30, y: 12 })
    const p2 = pixelToPlan(image, { x: 160, y: 70 })
    const next = calibrateTrace(image, p1, p2, 5)
    const pix1 = planToPixel(image, p1)
    const pix2 = planToPixel(image, p2)
    const stayed = pixelToPlan(next, pix1)
    const moved = pixelToPlan(next, pix2)
    expect(stayed.x).toBeCloseTo(p1.x)
    expect(stayed.y).toBeCloseTo(p1.y)
    expect(dist(stayed, moved)).toBeCloseTo(5)
    expect(next.scale).toBeCloseTo(image.scale * (5 / dist(p1, p2)))
    expect(planToPixel(next, p1).x).toBeCloseTo(pix1.x)
    expect(planToPixel(next, p1).y).toBeCloseTo(pix1.y)
  })

  it('ignores a repeated point and a non-positive distance', () => {
    const image = trace()
    const p1 = { x: 3, y: 4 }
    const p2 = { x: 6, y: 5 }
    expect(calibrateTrace(image, p1, p1, 5)).toBe(image)
    expect(calibrateTrace(image, p1, p2, 0)).toBe(image)
    expect(calibrateTrace(image, p1, p2, -2)).toBe(image)
  })

  it('bounds the rotated image', () => {
    const image = trace({ origin: { x: 0, y: 0 }, scale: 1, rotation: Math.PI / 2 })
    const box = traceBounds(image, 2, 3)
    const corners = [
      pixelToPlan(image, { x: 0, y: 0 }),
      pixelToPlan(image, { x: 2, y: 0 }),
      pixelToPlan(image, { x: 2, y: 3 }),
      pixelToPlan(image, { x: 0, y: 3 }),
    ]
    expect(box.minX).toBeCloseTo(Math.min(...corners.map((p) => p.x)))
    expect(box.minY).toBeCloseTo(Math.min(...corners.map((p) => p.y)))
    expect(box.maxX).toBeCloseTo(Math.max(...corners.map((p) => p.x)))
    expect(box.maxY).toBeCloseTo(Math.max(...corners.map((p) => p.y)))
  })

  it('fits the image to about 80% of the view, centred', () => {
    const view = { minX: 0, minY: 0, maxX: 10, maxY: 8 }
    const fitted = fitTraceToView({
      levelId: 'level_test',
      src: 'data:,',
      width: 1000,
      height: 500,
      view,
    })
    const box = traceBounds(fitted, 1000, 500)
    const width = box.maxX - box.minX
    const height = box.maxY - box.minY
    expect(width / 10).toBeCloseTo(0.8)
    expect(height / 8).toBeLessThanOrEqual(0.8 + 1e-9)
    expect((box.minX + box.maxX) / 2).toBeCloseTo(5)
    expect((box.minY + box.maxY) / 2).toBeCloseTo(4)
    expect(fitted.rotation).toBe(0)
    expect(fitted.width).toBe(1000)
    expect(fitted.height).toBe(500)
  })
})
