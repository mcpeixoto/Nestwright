import { describe, expect, it } from 'vitest'
import { buildPlanPdf } from '../../src/io/export/planPdf'
import { createLevel } from '../../src/model/defaults'
import { addWallChain } from '../../src/model/ops'
import { rect, sampleProject } from './planFixture'

function latin1(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]!)
  return out
}

function pageCount(pdf: string): number {
  return (pdf.match(/\/Type\s*\/Page(?!s)/g) ?? []).length
}

describe('plan pdf renderer', () => {
  it('produces a PDF with embedded TrueType fonts', () => {
    const bytes = buildPlanPdf(sampleProject(), { scale: 50, paper: 'A3', orientation: 'auto', date: '2026-11-14' })
    expect(bytes).toBeInstanceOf(Uint8Array)
    const pdf = latin1(bytes)
    expect(pdf.startsWith('%PDF-')).toBe(true)
    expect(pdf).toContain('/FontFile2')
    expect(pdf).toContain('Identity-H')
    expect(pageCount(pdf)).toBe(1)
  })

  it('writes one page per selected level', () => {
    const project = sampleProject()
    const upper = createLevel('Upper', 3)
    addWallChain(upper, rect(5, 4), { thickness: 0.2 })
    project.levels.push(upper)
    const empty = createLevel('Attic', 6)
    project.levels.push(empty)
    const all = latin1(buildPlanPdf(project, { scale: 100, paper: 'A4', orientation: 'auto' }))
    expect(pageCount(all)).toBe(2) // default: levels with walls
    const one = latin1(buildPlanPdf(project, { scale: 100, paper: 'A4', orientation: 'auto', levelIds: [upper.id] }))
    expect(pageCount(one)).toBe(1)
    const three = latin1(buildPlanPdf(project, { scale: 100, paper: 'A4', orientation: 'auto', levelIds: project.levels.map((l) => l.id) }))
    expect(pageCount(three)).toBe(3)
  })
})
