import { describe, expect, it } from 'vitest'
import { budgetPdf } from '../../src/io/export/budgetPdf'
import { createProject } from '../../src/model/defaults'

describe('budgetPdf', () => {
  it('starts with the PDF header and embeds the Noto Sans font', () => {
    const project = createProject('Willow', 'house')
    const pdf = new TextDecoder('latin1').decode(budgetPdf(project, 'en', new Date('2026-11-15T00:00:00Z')))
    expect(pdf.startsWith('%PDF-')).toBe(true)
    expect(pdf).toContain('/FontFile2')
  })
})
