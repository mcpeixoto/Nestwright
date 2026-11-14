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

  it('names the plan and embeds a Unicode font, one page per level', () => {
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
    // The plan is drawn with jsPDF and an embedded font, so page text is glyph codes in a
    // compressed stream; names and areas are checked on the sheet layout (planSheet.test.ts).
    const pdf = new TextDecoder('latin1').decode(buildPlanPdf(project))
    expect(pdf.startsWith('%PDF-')).toBe(true)
    expect(pdf).toContain('/Title (Willow Cottage)')
    expect(pdf).toContain('/FontFile2')
    expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(1)
  })
})
