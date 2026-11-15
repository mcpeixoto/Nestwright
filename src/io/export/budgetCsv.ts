import { translate } from '../../i18n'
import { budgetCategoryKey, type BudgetEstimate } from '../../model/budget'
import type { Project } from '../../model/types'
import { budgetLineText, budgetSourceKey } from './budgetLabels'

/** Excel only reads a CSV as UTF-8 (accents, €) when it starts with a byte-order mark. */
export const CSV_BOM = '\ufeff'

function isPortuguese(language: string): boolean {
  return language === 'pt-PT' || language === 'pt'
}

/**
 * Budget table as CSV, in the player's language.
 *
 * RFC 4180 quoting: a field that contains the separator, a double quote, or a
 * line break is wrapped in double quotes, and each quote inside it is doubled.
 *
 * pt-PT uses `;` as the separator and a decimal comma, which is what Portuguese
 * Excel expects (`,` is its decimal mark). Every other language uses `,` and `.`.
 */
export function budgetCsv(estimate: BudgetEstimate, project: Project, language: string): string {
  const pt = isPortuguese(language)
  const sep = pt ? ';' : ','
  const tr = (key: string) => translate(language, key)
  const num = (value: number) => formatNum(value, pt)
  const header = ['Category', 'Room', 'Item', 'Quantity', 'Unit price', 'Total', 'Source'].map(tr)
  const body = estimate.lines.map((line) => [
    tr(budgetCategoryKey(line.category)),
    line.roomName ?? '',
    budgetLineText(line, language),
    num(line.quantity),
    num(line.unitPrice),
    num(line.amount),
    tr(budgetSourceKey(line.source)),
  ])
  const totals = [tr('Total'), '', project.name ?? '', '', '', num(estimate.total), '']
  return [header, ...body, totals].map((row) => row.map((cell) => quoteCell(cell, sep)).join(sep)).join('\r\n')
}

function formatNum(value: number, decimalComma: boolean): string {
  const text = Number.isFinite(value) ? String(Math.round(value * 100) / 100) : '0'
  return decimalComma ? text.replace('.', ',') : text
}

function quoteCell(value: string, sep: string): string {
  const text = value ?? ''
  if (text.includes(sep) || text.includes('"') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}
