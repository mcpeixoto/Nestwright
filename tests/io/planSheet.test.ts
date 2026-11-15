import { describe, expect, it } from 'vitest'
import { layoutPlanSheet, type Primitive, type Sheet, type TextPrim } from '../../src/io/export/planSheet'
import { addWallChain } from '../../src/model/ops'
import { rect, sampleProject } from './planFixture'

const DATE = '2026-11-14'

function texts(sheet: Sheet): string[] {
  return sheet.primitives.filter((p): p is TextPrim => p.kind === 'text').map((p) => p.text)
}

function bboxOf(prims: Primitive[]) {
  const xs: number[] = []
  const ys: number[] = []
  for (const p of prims) {
    if (p.kind !== 'polygon') continue
    for (const q of p.points) {
      xs.push(q.x)
      ys.push(q.y)
    }
  }
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), minX: Math.min(...xs), maxY: Math.max(...ys) }
}

function sheetFor(project = sampleProject(), opts: Partial<Parameters<typeof layoutPlanSheet>[2]> = {}): Sheet {
  return layoutPlanSheet(project, project.levels[0]!, { scale: 100, paper: 'A4', orientation: 'landscape', date: DATE, ...opts })
}

describe('plan sheet layout', () => {
  it('draws walls at a fixed scale: 1 m = 10 mm at 1:100, 20 mm at 1:50', () => {
    const at100 = sheetFor()
    expect(at100.width).toBe(297)
    expect(at100.height).toBe(210)
    expect(at100.mmPerMetre).toBe(10)
    expect(at100.fits).toBe(true)
    const walls100 = bboxOf(at100.primitives.filter((p) => p.tag === 'wall'))
    // Centre-line 6 × 4 m is 60 × 40 mm; the outer wall faces add one wall thickness (0.2 m).
    expect(walls100.w - 0.2 * 10).toBeCloseTo(60, 0)
    expect(walls100.h - 0.2 * 10).toBeCloseTo(40, 0)
    expect(Math.abs(walls100.w - 62)).toBeLessThan(0.5)
    expect(Math.abs(walls100.h - 42)).toBeLessThan(0.5)

    const at50 = sheetFor(undefined, { scale: 50 })
    const walls50 = bboxOf(at50.primitives.filter((p) => p.tag === 'wall'))
    expect(Math.abs(walls50.w - 0.2 * 20 - 120)).toBeLessThan(0.5)
    expect(Math.abs(walls50.h - 0.2 * 20 - 80)).toBeLessThan(0.5)
  })

  it('keeps plan north up: plan +y is up the page', () => {
    const sheet = sheetFor()
    const top = sheet.origin.y - 4 * sheet.mmPerMetre
    expect(top).toBeLessThan(sheet.origin.y)
  })

  it('centres the drawing inside the printable area above the title block', () => {
    const sheet = sheetFor()
    const walls = bboxOf(sheet.primitives.filter((p) => p.tag === 'wall'))
    expect(walls.minX).toBeGreaterThan(10)
    expect(walls.maxY).toBeLessThan(210 - 10 - 30)
  })

  it('reports a level that does not fit instead of rescaling', () => {
    const big = sampleProject()
    const level = big.levels[0]!
    addWallChain(level, rect(14, 9).map((p) => ({ x: p.x + 8, y: p.y })), { thickness: 0.2 })
    const sheet = sheetFor(big, { scale: 50 })
    expect(sheet.fits).toBe(false)
    expect(sheet.mmPerMetre).toBe(20)
    expect(sheetFor(big, { scale: 50, orientation: 'auto' }).fits).toBe(false)
    expect(sheetFor(big, { scale: 100 }).fits).toBe(true)
  })

  it('auto orientation turns the page when that makes the drawing fit', () => {
    const tall = sampleProject()
    const level = tall.levels[0]!
    level.walls = []
    level.openings = []
    level.items = []
    level.dimensions = []
    level.rooms = []
    addWallChain(level, rect(7, 10), { thickness: 0.2 })
    const landscape = sheetFor(tall, { scale: 50 })
    expect(landscape.fits).toBe(false)
    const auto = sheetFor(tall, { scale: 50, orientation: 'auto' })
    expect(auto.fits).toBe(true)
    expect(auto.orientation).toBe('portrait')
    expect(auto.width).toBe(210)
    expect(auto.height).toBe(297)
  })

  it('writes room name, net area, dimensions and scale as Unicode text', () => {
    const all = texts(sheetFor(undefined, { scale: 50 }))
    expect(all).toContain('Sala de estar')
    expect(all).toContain('22 m²') // 5.8 × 3.8 inside the 0.2 m walls = 22.04
    expect(all).toContain('5.8 m') // clear inner width
    expect(all).toContain('3.8 m') // clear inner depth
    expect(all).toContain('6.2 m') // overall outer width
    expect(all).toContain('4.2 m') // overall outer depth
    expect(all).toContain('3.25 m') // the user's dimension line
    expect(all).toContain('Scale 1:50')
    expect(all.some((t) => t.includes('Scale: 1:50'))).toBe(true)
    expect(all).toContain('Casa Pátio')
    expect(all.some((t) => t.includes('2026-11-14'))).toBe(true)
    expect(all.some((t) => t.includes('Net area 22 m²'))).toBe(true)
    expect(all).toContain('Nestwright')
    for (const label of ['Legend', 'Wall', 'Door swing', 'Window', 'Furniture outline', 'Dimension line']) {
      expect(all).toContain(label)
    }
  })

  it('translates the title block and legend to European Portuguese', () => {
    const all = texts(sheetFor(undefined, { scale: 50, language: 'pt-PT' }))
    expect(all.some((t) => t.startsWith('Escala: 1:50') && t.includes('Papel: A4 Horizontal'))).toBe(true)
    expect(all.some((t) => t.includes('Área útil 22 m²'))).toBe(true)
    expect(all.some((t) => t.startsWith('Piso: '))).toBe(true)
    for (const label of ['Legenda', 'Parede', 'Janela', 'Abertura da porta', 'Linha de cota', 'Contorno do mobiliário']) {
      expect(all).toContain(label)
    }
  })

  it('uses feet and inches for an imperial project', () => {
    const all = texts(sheetFor(sampleProject({ units: 'imperial' })))
    expect(all).toContain(`19' 0"`) // 5.8 m clear width
    expect(all).toContain(`10' 8"`) // the 3.25 m user dimension
    expect(all).toContain('237 ft²')
    expect(all.some((t) => t === '15 ft')).toBe(true)
    expect(all.some((t) => / m$/.test(t) || t.endsWith(' m²'))).toBe(false)
  })

  it('draws a door swing arc that mirrors when the hinge flips', () => {
    const plain = sheetFor().primitives.filter((p) => p.kind === 'arc' && p.tag === 'door-swing')
    const flipped = sheetFor(sampleProject({ flipHinge: true })).primitives.filter((p) => p.kind === 'arc' && p.tag === 'door-swing')
    expect(plain).toHaveLength(1)
    expect(flipped).toHaveLength(1)
    const a = plain[0]!
    const b = flipped[0]!
    if (a.kind !== 'arc' || b.kind !== 'arc') throw new Error('not an arc')
    expect(a.radius).toBeCloseTo(9, 5) // 0.9 m leaf at 1:100
    expect(Math.abs(a.sweep)).toBeCloseTo(Math.PI / 2, 5)
    expect(b.sweep).toBeCloseTo(-a.sweep, 5)
    expect(b.center.x - a.center.x).toBeCloseTo(9, 5)
    expect(b.center.y).toBeCloseTo(a.center.y, 5)
  })

  it('draws a window as three lines and furniture as outlines', () => {
    const sheet = sheetFor()
    expect(sheet.primitives.filter((p) => p.tag === 'window')).toHaveLength(3)
    const items = sheet.primitives.filter((p) => p.tag === 'item')
    expect(items).toHaveLength(2)
    const sofa = bboxOf([items[0]!])
    expect(sofa.w).toBeCloseTo(20, 5)
    expect(sofa.h).toBeCloseTo(9, 5)
  })

  it('rotates the north arrow with environment.north', () => {
    const arrowDir = (north: number) => {
      const project = sampleProject()
      project.environment.north = north
      const arrow = sheetFor(project).primitives.find((p) => p.kind === 'polygon' && p.tag === 'north-arrow')
      if (!arrow || arrow.kind !== 'polygon') throw new Error('no arrow')
      const [tip, , centre] = arrow.points
      const dx = tip!.x - centre!.x
      const dy = tip!.y - centre!.y
      const l = Math.hypot(dx, dy)
      return { x: dx / l, y: dy / l }
    }
    const up = arrowDir(0)
    expect(up.x).toBeCloseTo(0, 5)
    expect(up.y).toBeCloseTo(-1, 5)
    const quarter = arrowDir(Math.PI / 2)
    expect(quarter.x).toBeCloseTo(1, 5)
    expect(quarter.y).toBeCloseTo(0, 5)
  })
})
