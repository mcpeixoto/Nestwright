/** A3 landscape, in PDF points (1/72 inch). */
export const A3_LANDSCAPE = { width: 1190.55, height: 841.89 }

export function escapePdfText(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`
    else if (code >= 32 && code <= 126) out += ch
    else out += '?'
  }
  return out
}

function num(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const rounded = Math.round(value * 100) / 100
  return String(rounded)
}

/** One page of vector ops. Coordinates are PDF points, origin bottom-left. */
export class PdfPage {
  private ops: string[] = []
  private path: string[] = []

  constructor(
    readonly width = A3_LANDSCAPE.width,
    readonly height = A3_LANDSCAPE.height,
  ) {}

  setFill(r: number, g: number, b: number): void {
    this.ops.push(`${num(r)} ${num(g)} ${num(b)} rg`)
  }

  setStroke(r: number, g: number, b: number): void {
    this.ops.push(`${num(r)} ${num(g)} ${num(b)} RG`)
  }

  setLineWidth(width: number): void {
    this.ops.push(`${num(width)} w`)
  }

  moveTo(x: number, y: number): void {
    this.path.push(`${num(x)} ${num(y)} m`)
  }

  lineTo(x: number, y: number): void {
    this.path.push(`${num(x)} ${num(y)} l`)
  }

  closePath(): void {
    this.path.push('h')
  }

  fill(): void {
    if (this.path.length === 0) return
    this.ops.push(`${this.path.join('\n')}\nf`)
    this.path = []
  }

  stroke(): void {
    if (this.path.length === 0) return
    this.ops.push(`${this.path.join('\n')}\nS`)
    this.path = []
  }

  rect(x: number, y: number, w: number, h: number): void {
    this.moveTo(x, y)
    this.lineTo(x + w, y)
    this.lineTo(x + w, y + h)
    this.lineTo(x, y + h)
    this.closePath()
  }

  text(x: number, y: number, size: number, value: string): void {
    const body = escapePdfText(value)
    this.ops.push(`BT /F1 ${num(size)} Tf 1 0 0 1 ${num(x)} ${num(y)} Tm (${body}) Tj ET`)
  }

  stream(): string {
    return this.ops.join('\n')
  }
}

function objectBody(body: string): string {
  return `${body}\n`
}

/** Assemble pages into a PDF document that uses the standard Helvetica font. */
export function encodePdf(pages: readonly PdfPage[]): string {
  const safe = pages.length > 0 ? pages : [new PdfPage()]
  const fontId = 1
  const pagesId = 2
  const pageIds: number[] = []
  const contentIds: number[] = []
  let next = 3
  for (let i = 0; i < safe.length; i++) {
    pageIds.push(next++)
    contentIds.push(next++)
  }
  const catalogId = next
  const bodies: string[] = []
  bodies[fontId] = objectBody('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  const kids = pageIds.map((id) => `${id} 0 R`).join(' ')
  bodies[pagesId] = objectBody(`<< /Type /Pages /Count ${safe.length} /Kids [${kids}] >>`)
  for (let i = 0; i < safe.length; i++) {
    const page = safe[i]!
    const content = page.stream()
    const contentId = contentIds[i]!
    const pageId = pageIds[i]!
    bodies[contentId] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream\n`
    bodies[pageId] = objectBody(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
    )
  }
  bodies[catalogId] = objectBody(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`)

  let out = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (let i = 1; i < bodies.length; i++) {
    offsets[i] = out.length
    out += `${i} 0 obj\n${bodies[i]}endobj\n`
  }
  const xref = out.length
  out += `xref\n0 ${bodies.length}\n`
  out += '0000000000 65535 f \n'
  for (let i = 1; i < bodies.length; i++) {
    out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  out += `trailer\n<< /Size ${bodies.length} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return out
}
