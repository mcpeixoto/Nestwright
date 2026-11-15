import { jsPDF } from 'jspdf'
import { fill, translate } from '../../i18n'
import {
  BUDGET_CATEGORIES,
  budgetCategoryKey,
  estimateBudget,
  variantBudgets,
} from '../../model/budget'
import { formatMoney } from '../../model/money'
import type { Project } from '../../model/types'
import { budgetLineText, budgetSourceKey } from './budgetLabels'
import { PLAN_FONT, PLAN_FONT_FILES } from './planFonts'

function registerFonts(doc: jsPDF): void {
  for (const font of PLAN_FONT_FILES) {
    doc.addFileToVFS(font.file, font.base64)
    doc.addFont(font.file, PLAN_FONT, font.style, undefined, 'Identity-H')
  }
}


/** A4 portrait budget report, drawn with the embedded Noto Sans fonts. */
export function budgetPdf(project: Project, language: string, now: Date = new Date()): Uint8Array {
  const estimate = estimateBudget(project)
  const compared = variantBudgets(project)
  const tr = (key: string, vars?: Record<string, string | number>) =>
    vars ? fill(language, key, vars) : translate(language, key)
  const money = (amount: number) => formatMoney(amount, estimate.currency, language)
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  registerFonts(doc)
  doc.setProperties({ title: `${project.name} — ${tr('Budget')}`, creator: 'Nestwright' })

  const left = 14
  const pageWidth = 182
  let y = 18

  function ensure(height: number) {
    if (y + height <= 284) return
    doc.addPage()
    y = 16
  }

  function heading(value: string, size: number) {
    ensure(size * 0.5 + 4)
    doc.setFont(PLAN_FONT, 'bold')
    doc.setFontSize(size)
    doc.setTextColor(20, 24, 28)
    doc.text(value, left, y)
    y += size * 0.45 + 3
  }

  function paragraph(value: string) {
    ensure(6)
    doc.setFont(PLAN_FONT, 'normal')
    doc.setFontSize(10)
    doc.setTextColor(20, 24, 28)
    const lines = doc.splitTextToSize(value, pageWidth) as string[]
    for (const line of lines) {
      ensure(5)
      doc.text(line, left, y)
      y += 4.5
    }
  }

  function row(values: string[], widths: number[], bold = false) {
    ensure(6)
    doc.setFont(PLAN_FONT, bold ? 'bold' : 'normal')
    doc.setFontSize(8)
    doc.setTextColor(20, 24, 28)
    let x = left
    for (let i = 0; i < values.length; i++) {
      const cell = widths[i] ?? 20
      const fitted = doc.splitTextToSize(values[i] ?? '', Math.max(4, cell - 1)) as string[]
      doc.text(fitted[0] ?? '', x, y)
      x += cell
    }
    y += 4.6
  }

  const dateTag = language === 'pt-PT' || language === 'pt' ? 'pt-PT' : 'en'
  const date = now.toLocaleDateString(dateTag, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })

  heading(tr('Budget'), 18)
  paragraph(project.name || tr('Untitled'))
  paragraph(`${tr('Date')}: ${date}`)
  paragraph(`${tr('Currency')}: ${estimate.currency}`)
  y += 2

  heading(tr('Category'), 12)
  row([tr('Category'), tr('Total')], [120, 62], true)
  for (const category of BUDGET_CATEGORIES) {
    row([tr(budgetCategoryKey(category)), money(estimate.byCategory[category])], [120, 62])
  }
  y += 3

  heading(tr('Lines'), 12)
  row(
    [tr('Category'), tr('Room'), tr('Item'), tr('Quantity'), tr('Unit price'), tr('Total'), tr('Source')],
    [24, 28, 32, 18, 26, 28, 26],
    true,
  )
  if (estimate.lines.length === 0) paragraph(tr('No rooms yet'))
  for (const line of estimate.lines) {
    row(
      [
        tr(budgetCategoryKey(line.category)),
        line.roomName,
        budgetLineText(line, language),
        formatQty(line.quantity),
        money(line.unitPrice),
        money(line.amount),
        tr(budgetSourceKey(line.source)),
      ],
      [24, 28, 32, 18, 26, 28, 26],
    )
  }

  const extras = project.budget?.extras ?? []
  if (extras.length > 0) {
    y += 3
    heading(tr('Extra lines'), 12)
    row([tr('Label'), tr('Kind'), tr('Amount')], [90, 46, 46], true)
    for (const extra of extras) {
      const kind = extra.kind === 'labour' || extra.kind === 'fees' || extra.kind === 'other' ? extra.kind : 'other'
      row([extra.label, tr(budgetCategoryKey(kind)), money(finite(extra.amount))], [90, 46, 46])
    }
  }

  if (compared.length > 1) {
    y += 3
    heading(tr('Variant comparison'), 12)
    row([tr('Name'), tr('Total'), tr('Difference')], [80, 51, 51], true)
    for (const variant of compared) {
      const name = variant.id === 'current' ? tr('Current design') : variant.name
      const difference = variant.id === 'current' ? '—' : signed(variant.difference, money)
      row([name, money(variant.total), difference], [80, 51, 51])
    }
  }

  y += 4
  heading(`${tr('Grand total')}: ${money(estimate.total)}`, 14)
  if (estimate.target != null) {
    paragraph(`${tr('Target')}: ${money(estimate.target)}`)
    if (estimate.delta != null) {
      const key = estimate.delta >= 0 ? 'Under by {amount}' : 'Over by {amount}'
      paragraph(tr(key, { amount: money(Math.abs(estimate.delta)) }))
    }
  }

  return new Uint8Array(doc.output('arraybuffer'))
}

function finite(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0
  return value
}

function formatQty(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return String(Math.round(value * 100) / 100)
}

function signed(amount: number, format: (value: number) => string): string {
  if (amount === 0) return format(0)
  return `${amount > 0 ? '+' : '−'}${format(Math.abs(amount))}`
}
