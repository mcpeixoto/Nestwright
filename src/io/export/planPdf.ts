import { jsPDF } from 'jspdf'
import type { Project } from '../../model/types'
import { PLAN_FONT, PLAN_FONT_FILES } from './planFonts'
import { DEFAULT_SHEET_OPTIONS, layoutPlanSheets, type PlanSheetOptions, type Primitive, type Sheet } from './planSheet'

function registerFonts(doc: jsPDF): void {
  for (const font of PLAN_FONT_FILES) {
    doc.addFileToVFS(font.file, font.base64)
    doc.addFont(font.file, PLAN_FONT, font.style, undefined, 'Identity-H')
  }
}

function path(doc: jsPDF, points: readonly { x: number; y: number }[], closed: boolean): boolean {
  const first = points[0]
  if (!first || points.length < 2) return false
  doc.moveTo(first.x, first.y)
  for (const p of points.slice(1)) doc.lineTo(p.x, p.y)
  if (closed) doc.close()
  return true
}

function arcPoints(prim: Extract<Primitive, { kind: 'arc' }>): { x: number; y: number }[] {
  const steps = Math.max(8, Math.ceil((Math.abs(prim.sweep) / (Math.PI / 2)) * 16))
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = prim.start + (prim.sweep * i) / steps
    return { x: prim.center.x + Math.cos(t) * prim.radius, y: prim.center.y + Math.sin(t) * prim.radius }
  })
}

function drawPrimitive(doc: jsPDF, prim: Primitive): void {
  switch (prim.kind) {
    case 'line': {
      doc.setDrawColor(...prim.color)
      doc.setLineWidth(prim.weight)
      if (prim.dash) doc.setLineDashPattern(prim.dash, 0)
      doc.line(prim.a.x, prim.a.y, prim.b.x, prim.b.y)
      if (prim.dash) doc.setLineDashPattern([], 0)
      return
    }
    case 'polygon': {
      if (!prim.fill && !prim.stroke) return
      if (prim.fill) doc.setFillColor(...prim.fill)
      if (prim.stroke) {
        doc.setDrawColor(...prim.stroke)
        doc.setLineWidth(prim.weight ?? 0.2)
      }
      if (!path(doc, prim.points, true)) return
      if (prim.fill && prim.stroke) doc.fillStroke()
      else if (prim.fill) doc.fill()
      else doc.stroke()
      return
    }
    case 'arc': {
      doc.setDrawColor(...prim.color)
      doc.setLineWidth(prim.weight)
      if (path(doc, arcPoints(prim), false)) doc.stroke()
      return
    }
    case 'text': {
      if (!prim.text) return
      doc.setFont(PLAN_FONT, prim.bold ? 'bold' : 'normal')
      doc.setFontSize(prim.size)
      doc.setTextColor(...prim.color)
      // jsPDF's own `align` ignores `angle`, so shift the start point along the rotated baseline.
      const rotation = prim.rotation ?? 0
      const rad = (rotation * Math.PI) / 180
      const width = doc.getTextWidth(prim.text)
      const shift = prim.anchor === 'middle' ? width / 2 : prim.anchor === 'end' ? width : 0
      const x = prim.at.x - Math.cos(rad) * shift
      const y = prim.at.y + Math.sin(rad) * shift
      doc.text(prim.text, x, y, rotation ? { angle: rotation } : undefined)
      return
    }
  }
}

/** Draw laid-out sheets into one PDF; one page per sheet. */
export function renderSheets(sheets: readonly Sheet[], title = ''): Uint8Array {
  const first = sheets[0]
  const doc = new jsPDF({
    unit: 'mm',
    format: first ? [first.width, first.height] : 'a4',
    orientation: first?.orientation ?? 'landscape',
    compress: true,
  })
  registerFonts(doc)
  if (title) doc.setProperties({ title, creator: 'Nestwright' })
  doc.setLineCap('butt')
  doc.setLineJoin('miter')
  sheets.forEach((sheet, index) => {
    if (index > 0) doc.addPage([sheet.width, sheet.height], sheet.orientation)
    for (const prim of sheet.primitives) drawPrimitive(doc, prim)
  })
  if (!first) {
    doc.setFont(PLAN_FONT, 'normal')
    doc.setFontSize(12)
    doc.text('Nestwright', 20, 20)
  }
  return new Uint8Array(doc.output('arraybuffer'))
}

/** Fixed-scale plan PDF: one page per selected level. */
export function buildPlanPdf(project: Project, options: PlanSheetOptions = DEFAULT_SHEET_OPTIONS): Uint8Array {
  return renderSheets(layoutPlanSheets(project, options), project.name)
}
