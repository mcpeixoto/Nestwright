import { describe, expect, it } from 'vitest'
import { buildPlanPdf } from '../../src/io/export/planPdf'
import { encodePdf, escapePdfText, PdfPage } from '../../src/io/export/pdf'
import { createProject } from '../../src/model/defaults'
import { addWallChain } from '../../src/model/ops'

describe('pdf writer', () => {
  it('starts with the PDF header and keeps text in the stream', () => {
    const page = new PdfPage()
    page.text(40, 40, 12, 'Hello (plan)')
    const pdf = encodePdf([page])
    expect(pdf.startsWith('%PDF-')).toBe(true)
    expect(pdf).toContain('Hello \\(plan\\)')
    expect(pdf).toContain('/Helvetica')
    expect(escapePdfText('A (b)')).toBe('A \\(b\\)')
  })

  it('includes the project name, level and area on a floor-plan page', () => {
    const project = createProject('Willow Cottage', 'house')
    const level = project.levels[0]
    expect(level).toBeTruthy()
    if (!level) return
    addWallChain(
      level,
      [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 6, y: 4 },
        { x: 0, y: 4 },
        { x: 0, y: 0 },
      ],
      { height: level.height, thickness: 0.2, left: { id: 'plaster-white' }, right: { id: 'plaster-white' } },
    )
    const pdf = buildPlanPdf(project)
    expect(pdf.startsWith('%PDF-')).toBe(true)
    expect(pdf).toContain('Willow Cottage')
    expect(pdf).toContain('Ground')
    expect(pdf).toContain('m2')
  })
})
